package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
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

func TestLaterChangeWinsPerField(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("aaaaaaaa1", "servings", "srv1", clock(ms, 0, "anna"), map[string]any{"note": "alt", "servedAt": 1}))
	mustApply(t, s, chg("aaaaaaaa2", "servings", "srv1", clock(ms+10, 0, "jonas"), map[string]any{"note": "neu"}))
	mustApply(t, s, chg("aaaaaaaa3", "servings", "srv1", clock(ms+5, 0, "anna"), map[string]any{"note": "zwischendurch"}))
	if got := field(s, "servings", "srv1", "note"); got != `"neu"` {
		t.Fatalf("note = %s, expected the later change", got)
	}
	if got := field(s, "servings", "srv1", "servedAt"); got != `1` {
		t.Fatalf("servedAt = %s, other fields must stay as they were", got)
	}
}

func TestTwoDevicesRateDifferentPets(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s,
		chg("bbbbbbbb1", "servings", "srv1", clock(ms, 0, "anna"), map[string]any{"pets.minka": map[string]any{"r": "gut"}}),
		chg("bbbbbbbb2", "servings", "srv1", clock(ms, 0, "jonas"), map[string]any{"pets.tiger": map[string]any{"r": "sosse"}}))
	if field(s, "servings", "srv1", "pets.minka") == "<fehlt>" || field(s, "servings", "srv1", "pets.tiger") == "<fehlt>" {
		t.Fatal("both ratings must be kept")
	}
}

func TestDeleteAndUndo(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("cccccccc1", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka", "_del": false}))
	mustApply(t, s, chg("cccccccc2", "pets", "pet1", clock(ms+1000, 0, "anna"), map[string]any{"_del": true}))
	mustApply(t, s, chg("cccccccc3", "pets", "pet1", clock(ms+2000, 0, "jonas"), map[string]any{"name": "Minka II"}))
	if got := field(s, "pets", "pet1", "_del"); got != "true" {
		t.Fatalf("_del = %s, a name change must not restore anything", got)
	}
	mustApply(t, s, chg("cccccccc4", "pets", "pet1", clock(ms+3000, 0, "anna"), map[string]any{"_del": false}))
	if got := field(s, "pets", "pet1", "_del"); got != "false" {
		t.Fatalf("_del = %s, undo must restore", got)
	}
}

func TestSentTwiceCountsOnce(t *testing.T) {
	s, _ := openTemp(t)
	c := chg("dddddddd1", "products", "prd1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"brand": "Sheba"})
	ok1, _ := mustApply(t, s, c)
	_, seq1 := s.Seq()
	ok2, _ := mustApply(t, s, c)
	_, seq2 := s.Seq()
	if len(ok1) != 1 || len(ok2) != 1 || seq1 != seq2 {
		t.Fatalf("ok=%v/%v seq=%d/%d: a duplicate change must be confirmed but not counted again", ok1, ok2, seq1, seq2)
	}
}

func TestInvalidChangesAreRejected(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	cases := map[string]Change{
		"Sammlung":     chg("eeeeeeee1", "Users!", "x1234", clock(ms, 0, "anna"), map[string]any{"a": 1}),
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
		t.Fatalf("timestamp from the future: %v", rej)
	}
}

func TestIdenticalAfterRestart(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("gggggggg1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	e1, q1, sum1, _ := s.Checksum(nil)
	s2, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	e2, q2, sum2, _ := s2.Checksum(nil)
	if e1 != e2 || q1 != q2 || sum1 != sum2 {
		t.Fatal("after the restart the stored data must be identical")
	}
}

func TestWriteFailureRollsBack(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("hhhhhhhh1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	os.RemoveAll(dir) // makes the write fail
	_, _, _, err := s.Apply([]Change{chg("hhhhhhhh2", "pets", "pet1", clock(now.UnixMilli()+1, 0, "anna"), map[string]any{"name": "Kater"})}, now)
	if err == nil {
		t.Fatal("a write failure must be reported, or the phone would drop the change")
	}
	if field(s, "pets", "pet1", "name") != `"Minka"` {
		t.Fatal("after a write failure memory must match the persisted state")
	}
	if _, seen := s.st.Seen["hhhhhhhh2"]; seen {
		t.Fatal("the failed change must not count as known")
	}
}

func TestUnreadableFileIsSetAside(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("iiiiiiii1", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	oldEpoch, _ := s.Seq()
	os.WriteFile(filepath.Join(dir, stateFile), []byte("{kaputt"), 0o600)
	s2, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if e, seq := s2.Seq(); e == oldEpoch || seq != 0 {
		t.Fatal("an unreadable file means starting empty under a new epoch")
	}
	if m, _ := filepath.Glob(filepath.Join(dir, "state-unreadable-*.json")); len(m) != 1 {
		t.Fatal("the unreadable file must be kept aside")
	}
}

func TestPruneSeen(t *testing.T) {
	s, dir := openTemp(t)
	mustApply(t, s, chg("pruned01", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}))
	if err := s.PruneSeen(now.Add(keepSeen - time.Hour)); err != nil || len(s.st.Seen) != 1 {
		t.Fatalf("too early: %v %v", err, s.st.Seen)
	}
	if err := s.PruneSeen(now.Add(keepSeen + time.Hour)); err != nil {
		t.Fatal(err)
	}
	if s2, _ := OpenStore(dir); len(s2.st.Seen) != 0 || field(s2, "pets", "pet1", "name") != `"Minka"` {
		t.Fatalf("old change ids are forgotten, the data stays: %v", s2.st.Seen)
	}
}

func TestSinceWhileApplying(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range 200 {
			if _, _, _, err := s.Apply([]Change{chg(fmt.Sprintf("race%04d", i), "pets", "pet1", clock(ms+int64(i), 0, "anna"), map[string]any{"name": i})}, now); err != nil {
				t.Error(err)
				return
			}
		}
	}()
	for range 200 {
		_, _, recs := s.Since(0)
		json.Marshal(recs)
	}
	wg.Wait()
}

func TestConcurrentWrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "photo.jpg")
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- writeAtomic(path, []byte{byte(i)})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if left, _ := filepath.Glob(filepath.Join(filepath.Dir(path), ".*.tmp")); len(left) != 0 {
		t.Fatalf("temporary files left: %v", left)
	}
}

func TestSinceReturnsOnlyNewer(t *testing.T) {
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

func TestProductsForThePrompt(t *testing.T) {
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

func TestNewCollections(t *testing.T) {
	s, dir := openTemp(t)
	ms := now.UnixMilli()
	ok, rej := mustApply(t, s,
		chg("coll0001", "observations", "obs1", clock(ms, 0, "anna"), map[string]any{"kind": "stink", "at": ms, "pets.pet1": true, "_del": false}),
		chg("coll0002", "Observations", "obs2", clock(ms, 1, "anna"), map[string]any{"kind": "stink"}),
		chg("coll0003", "obs/x", "obs3", clock(ms, 2, "anna"), map[string]any{"kind": "stink"}))
	if len(ok) != 1 || len(rej) != 2 || field(s, "observations", "obs1", "kind") != `"stink"` || field(s, "observations", "obs1", "pets.pet1") != "true" {
		t.Fatalf("a new collection is kept, names of another shape are not: %v %v", ok, rej)
	}
	_, _, recs := s.Since(0)
	if len(recs) != 1 || recs[0].C != "observations" {
		t.Fatalf("catching up carries the new collection: %v", recs)
	}
	s2, err := OpenStore(dir)
	if err != nil || field(s2, "observations", "obs1", "kind") != `"stink"` {
		t.Fatalf("kept across a restart: %v", err)
	}
	for i := 0; len(s.st.Records) < maxColls; i++ {
		mustApply(t, s, chg(fmt.Sprintf("fill%04d", i), fmt.Sprintf("extra%d", i), "rec1", clock(ms, 0, "anna"), map[string]any{"a": 1}))
	}
	_, rej = mustApply(t, s, chg("toomany1", "onemore", "rec1", clock(ms, 0, "anna"), map[string]any{"a": 1}))
	if len(rej) != 1 || rej[0].Reason != "invalid" || len(s.st.Records) != maxColls {
		t.Fatalf("at most %d collections: %v", maxColls, rej)
	}
}

// Without colls the checksum covers baseColls only.
func TestChecksumPerCollection(t *testing.T) {
	s, _ := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s, chg("sum00001", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka"}))
	_, _, before, n1 := s.Checksum(nil)
	mustApply(t, s, chg("sum00002", "observations", "obs1", clock(ms, 1, "anna"), map[string]any{"kind": "tired"}))
	_, _, after, n2 := s.Checksum(nil)
	_, _, base, n3 := s.Checksum([]string{"pets", "products", "servings"})
	_, _, all, n4 := s.Checksum([]string{"pets", "products", "servings", "observations", "observations"})
	if before != after || n1 != n2 || base != before || n3 != n1 || all == before || n4 != n1+1 {
		t.Fatalf("checksum per collection: %v %v %v %v", n1, n2, n3, n4)
	}
}
