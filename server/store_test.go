package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var now = time.UnixMilli(1789800000000)

func clock(ms int64, n int, dev string) string { return fmt.Sprintf("%013d-%04d-%s", ms, n, dev) }

func raw(v any) json.RawMessage { b, _ := json.Marshal(v); return b }

func chg(id, c, r, t string, f map[string]any) Change {
	fields := map[string]json.RawMessage{}
	for k, v := range f {
		fields[k] = raw(v)
	}
	return Change{ID: id, C: c, R: r, T: t, F: fields}
}

func openTemp(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	return s, dir
}

func field(s *Store, c, r, k string) string {
	rec := s.st.Records[c][r]
	if rec == nil {
		return "<kein Datensatz>"
	}
	f, ok := rec.F[k]
	if !ok {
		return "<fehlt>"
	}
	return string(f.V)
}

func mustApply(t *testing.T, s *Store, changes ...Change) ([]string, []Rejected) {
	t.Helper()
	ok, rej, _, err := s.Apply(changes, now)
	if err != nil {
		t.Fatal(err)
	}
	return ok, rej
}

func TestSpaetereAenderungGewinntProFeld(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("aaaaaaaa1", "servings", "srv1", clock(ms, 0, "anna"), map[string]any{"note": "alt", "servedAt": 1}))
	mustApply(t, s, chg("aaaaaaaa2", "servings", "srv1", clock(ms+10, 0, "jonas"), map[string]any{"note": "neu"}))
	mustApply(t, s, chg("aaaaaaaa3", "servings", "srv1", clock(ms+5, 0, "anna"), map[string]any{"note": "zwischendurch"}))
	if got := field(s, "servings", "srv1", "note"); got != `"neu"` {
		t.Fatalf("note = %s, erwartet die spätere Änderung", got)
	}
	if got := field(s, "servings", "srv1", "servedAt"); got != `1` {
		t.Fatalf("servedAt = %s, andere Felder dürfen nicht leiden", got)
	}
}

func TestZweiGeraeteBewertenVerschiedeneTiere(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s,
		chg("bbbbbbbb1", "servings", "srv1", clock(ms, 0, "anna"), map[string]any{"pets.minka": map[string]any{"r": "gut"}}),
		chg("bbbbbbbb2", "servings", "srv1", clock(ms, 0, "jonas"), map[string]any{"pets.tiger": map[string]any{"r": "sosse"}}))
	if field(s, "servings", "srv1", "pets.minka") == "<fehlt>" || field(s, "servings", "srv1", "pets.tiger") == "<fehlt>" {
		t.Fatal("beide Bewertungen müssen erhalten bleiben")
	}
}

func TestLoeschenUndRueckgaengig(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("cccccccc1", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka", "_del": false}))
	mustApply(t, s, chg("cccccccc2", "pets", "pet1", clock(ms+1000, 0, "anna"), map[string]any{"_del": true}))
	// Ein Handy war offline und ändert danach nur den Namen: das holt den Eintrag nicht zurück
	mustApply(t, s, chg("cccccccc3", "pets", "pet1", clock(ms+2000, 0, "jonas"), map[string]any{"name": "Minka II"}))
	if got := field(s, "pets", "pet1", "_del"); got != "true" {
		t.Fatalf("_del = %s, eine Namensänderung darf nichts wiederherstellen", got)
	}
	// Rückgängig setzt _del ausdrücklich auf false
	mustApply(t, s, chg("cccccccc4", "pets", "pet1", clock(ms+3000, 0, "anna"), map[string]any{"_del": false}))
	if got := field(s, "pets", "pet1", "_del"); got != "false" {
		t.Fatalf("_del = %s, Rückgängig muss wiederherstellen", got)
	}
}

func TestDoppeltGesendetWirdNurEinmalGezaehlt(t *testing.T) {
	s, _ := openTemp(t)
	c := chg("dddddddd1", "products", "prd1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"brand": "Sheba"})
	ok1, _ := mustApply(t, s, c)
	_, seq1 := s.Seq()
	ok2, _ := mustApply(t, s, c)
	_, seq2 := s.Seq()
	if len(ok1) != 1 || len(ok2) != 1 || seq1 != seq2 {
		t.Fatalf("ok=%v/%v seq=%d/%d: doppelte Änderung muss bestätigt, aber nicht erneut gezählt werden", ok1, ok2, seq1, seq2)
	}
}

func TestUngueltigeAenderungenWerdenAbgelehnt(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	cases := map[string]Change{
		"Sammlung":     chg("eeeeeeee1", "users", "x1234", clock(ms, 0, "anna"), map[string]any{"a": 1}),
		"Datensatz":    chg("eeeeeeee2", "pets", "a b", clock(ms, 0, "anna"), map[string]any{"a": 1}),
		"Feldname":     chg("eeeeeeee3", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"__proto__": 1}),
		"_del":         chg("eeeeeeee4", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"_del": "ja"}),
		"Zeitstempel":  chg("eeeeeeee5", "pets", "pet1", "gestern", map[string]any{"name": "x"}),
		"keine Felder": {ID: "eeeeeeee6", C: "pets", R: "pet1", T: clock(ms, 0, "anna")},
	}
	for name, c := range cases {
		ok, rej := mustApply(t, s, c)
		if len(ok) != 0 || len(rej) != 1 || rej[0].Reason != "invalid" {
			t.Errorf("%s: ok=%v rejected=%v", name, ok, rej)
		}
	}
	future := chg("eeeeeeee7", "pets", "pet1", clock(ms+int64(time.Hour/time.Millisecond), 0, "anna"), map[string]any{"name": "x"})
	if _, rej := mustApply(t, s, future); len(rej) != 1 || rej[0].Reason != "clock" {
		t.Fatalf("Zeitstempel aus der Zukunft: %v", rej)
	}
}

func TestLokaleFelderBleibenAufDemHandy(t *testing.T) {
	s, _ := openTemp(t)
	mustApply(t, s, chg("ffffffff1", "servings", "srv1", clock(now.UnixMilli(), 0, "anna"),
		map[string]any{"photo": "data:image/jpeg;base64,xyz", "status": "recognizing", "note": "hallo"}))
	if field(s, "servings", "srv1", "photo") != "<fehlt>" || field(s, "servings", "srv1", "status") != "<fehlt>" {
		t.Fatal("photo und status dürfen nicht auf dem Server landen")
	}
	if field(s, "servings", "srv1", "note") != `"hallo"` {
		t.Fatal("note fehlt")
	}
}

func TestNachNeustartIdentisch(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("gggggggg1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	e1, q1, sum1, _ := s.Checksum()
	s2, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	e2, q2, sum2, _ := s2.Checksum()
	if e1 != e2 || q1 != q2 || sum1 != sum2 {
		t.Fatal("nach dem Neustart muss der Datenbestand identisch sein")
	}
}

func TestSpeicherfehlerRolltZurueck(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("hhhhhhhh1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	os.Mkdir(filepath.Join(dir, stateFile+".tmp"), 0o700) // Schreiben schlägt damit fehl
	_, _, _, err := s.Apply([]Change{chg("hhhhhhhh2", "pets", "pet1", clock(now.UnixMilli()+1, 0, "anna"), map[string]any{"name": "Kater"})}, now)
	if err == nil {
		t.Fatal("Schreibfehler muss gemeldet werden, sonst würde das Handy die Änderung verwerfen")
	}
	if field(s, "pets", "pet1", "name") != `"Minka"` {
		t.Fatal("nach einem Schreibfehler muss der Speicher dem gespeicherten Stand entsprechen")
	}
	if _, seen := s.st.Seen["hhhhhhhh2"]; seen {
		t.Fatal("die fehlgeschlagene Änderung darf nicht als bekannt gelten")
	}
}

func TestBeschaedigteDateiNutztBackup(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("iiiiiiii1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	if err := s.Backup(now); err != nil {
		t.Fatal(err)
	}
	oldEpoch, _ := s.Seq()
	os.WriteFile(filepath.Join(dir, stateFile), []byte("{kaputt"), 0o600)
	s2, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if field(s2, "pets", "pet1", "name") != `"Minka"` {
		t.Fatal("das Backup muss geladen werden")
	}
	if e, _ := s2.Seq(); e == oldEpoch {
		t.Fatal("nach dem Laden eines Backups braucht es eine neue Epoche")
	}
	if m, _ := filepath.Glob(filepath.Join(dir, "state.defekt-*.json")); len(m) != 1 {
		t.Fatal("die beschädigte Datei muss beiseitegelegt werden")
	}
}

func TestBackupsWerdenRotiert(t *testing.T) {
	s, dir := openTemp(t)
	for d := 0; d < 35; d++ {
		if err := s.Backup(now.AddDate(0, 0, d)); err != nil {
			t.Fatal(err)
		}
	}
	s.Backup(now.AddDate(0, 0, 34)) // derselbe Tag noch einmal
	files, _ := filepath.Glob(filepath.Join(dir, backupDir, "state-*.json"))
	if len(files) != keepBackups {
		t.Fatalf("%d Backups, erwartet %d", len(files), keepBackups)
	}
}

func TestSinceLiefertNurNeueres(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("jjjjjjjj1", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka"}))
	_, seq := s.Seq()
	mustApply(t, s, chg("jjjjjjjj2", "pets", "pet2", clock(ms, 1, "anna"), map[string]any{"name": "Tiger"}))
	_, _, recs := s.Since(seq)
	if len(recs) != 1 || recs[0].R != "pet2" {
		t.Fatalf("since=%d lieferte %v", seq, recs)
	}
}

func TestProdukteFuerDenPrompt(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s,
		chg("kkkkkkkk1", "products", "prod1", clock(ms, 0, "a1234"), map[string]any{"brand": "Sheba", "variety": "Lachs", "createdAt": 1}),
		chg("kkkkkkkk2", "products", "prod2", clock(ms, 1, "a1234"), map[string]any{"brand": "Felix", "variety": "Huhn", "createdAt": 2}),
		chg("kkkkkkkk3", "products", "prod3", clock(ms, 2, "a1234"), map[string]any{"brand": "Weg", "variety": "X", "createdAt": 3, "_del": true}))
	got := s.Products(60)
	if len(got) != 2 || got[0] != "Felix | Huhn" || got[1] != "Sheba | Lachs" {
		t.Fatalf("Produkte = %v", got)
	}
}
