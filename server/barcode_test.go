package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBarcodeNormalisieren(t *testing.T) {
	cases := map[string]string{"4006381333931": "4006381333931", "96385074": "96385074", "036000291452": "0036000291452", " 4006381333931 ": "4006381333931"}
	for in, want := range cases {
		if got, ok := NormalizeCode(in); !ok || got != want {
			t.Errorf("%q: %q %v, erwartet %q", in, got, ok, want)
		}
	}
	for _, bad := range []string{"4006381333932", "40063813339", "abc", "", "4006-381333931"} {
		if _, ok := NormalizeCode(bad); ok {
			t.Errorf("%q müsste ungültig sein", bad)
		}
	}
}

// fakeDB spielt eine Datenbank der Open-Food-Facts-Familie; products: Code → Antwort-JSON
func fakeDB(t *testing.T, products map[string]string, calls *atomic.Int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") != barcodeUserAgent {
			t.Errorf("User-Agent fehlt: %q", r.Header.Get("User-Agent"))
		}
		code := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v2/product/"), ".json")
		if body, ok := products[code]; ok {
			w.Write([]byte(`{"status":1,"product":` + body + `}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"code":"` + code + `","status":0,"status_verbose":"product not found"}`))
	}))
}

func newBarcodeAPI(t *testing.T, urls ...string) *API {
	t.Helper()
	a := newTestAPI(t, "")
	writeConfig(a.cfg.dir, Config{Code: testCode, APIKey: "sk-ant-test", BarcodeURLs: urls})
	a.cfg.mtime = time.Time{}
	return a
}

const sheba = `{"product_name":"Sheba Fresh Choice Huhn in Sauce 4x50g","brands":"Sheba,Mars","categories_tags":["en:pet-food","en:cat-food","en:wet-cat-food"]}`

func TestBarcodeTrefferMitAufbereitung(t *testing.T) {
	var calls atomic.Int32
	db := fakeDB(t, map[string]string{"4006381333931": sheba}, &calls)
	defer db.Close()
	a := newBarcodeAPI(t, db.URL)
	status, out, _ := call(a, "GET", "/api/barcode/4006381333931", testCode, nil)
	if status != 200 || out["found"] != true || out["brand"] != "Sheba" || out["variety"] != "Fresh Choice Huhn in Sauce" ||
		out["type"] != "Nassfutter" || out["animal"] != "Katze" || out["at"] != nil {
		t.Fatalf("%d %v", status, out)
	}
}

func TestBarcodeZweiteDatenbankUndDeutscherName(t *testing.T) {
	var calls atomic.Int32
	pet := fakeDB(t, nil, &calls)
	defer pet.Close()
	food := fakeDB(t, map[string]string{"96385074": `{"product_name":"Dog Snack","product_name_de":"Kaustreifen Rind 150 g","brands":"Rinti","categories_tags":["en:dog-treats"]}`}, &calls)
	defer food.Close()
	a := newBarcodeAPI(t, pet.URL, food.URL)
	_, out, _ := call(a, "GET", "/api/barcode/96385074", testCode, nil)
	if out["found"] != true || out["brand"] != "Rinti" || out["variety"] != "Kaustreifen Rind" || out["type"] != "Snack" || out["animal"] != "Hund" {
		t.Fatalf("%v", out)
	}
}

func TestBarcodeZwischenspeicher(t *testing.T) {
	var calls atomic.Int32
	db := fakeDB(t, map[string]string{"4006381333931": sheba}, &calls)
	defer db.Close()
	a := newBarcodeAPI(t, db.URL)
	call(a, "GET", "/api/barcode/4006381333931", testCode, nil) // Treffer
	call(a, "GET", "/api/barcode/96385074", testCode, nil)      // kein Treffer
	if calls.Load() != 2 {
		t.Fatalf("%d Anfragen", calls.Load())
	}
	a.now = func() time.Time { return now.Add(6 * 24 * time.Hour) }
	call(a, "GET", "/api/barcode/4006381333931", testCode, nil)
	call(a, "GET", "/api/barcode/96385074", testCode, nil)
	if calls.Load() != 2 {
		t.Fatalf("nach 6 Tagen: %d Anfragen, beide Ergebnisse müssen noch gemerkt sein", calls.Load())
	}
	a.now = func() time.Time { return now.Add(8 * 24 * time.Hour) }
	call(a, "GET", "/api/barcode/96385074", testCode, nil)
	call(a, "GET", "/api/barcode/4006381333931", testCode, nil)
	if calls.Load() != 3 {
		t.Fatalf("nach 8 Tagen: %d Anfragen, nur „kein Treffer“ darf abgelaufen sein", calls.Load())
	}
	// Der Zwischenspeicher überlebt einen Neustart
	b := OpenBarcodes(a.cfg.dir)
	if p, ok := b.cached("4006381333931", now); !ok || p.Brand != "Sheba" {
		t.Fatal("Zwischenspeicher nach Neustart leer")
	}
}

func TestBarcodeDatenbankNichtErreichbar(t *testing.T) {
	old := barcodeTimeout
	barcodeTimeout = 100 * time.Millisecond
	defer func() { barcodeTimeout = old }()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { time.Sleep(300 * time.Millisecond) }))
	defer slow.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer broken.Close()
	a := newBarcodeAPI(t, slow.URL, broken.URL)
	if s, out, _ := call(a, "GET", "/api/barcode/4006381333931", testCode, nil); s != 502 || out["error"] == nil {
		t.Fatalf("%d %v", s, out)
	}
	if _, ok := a.barcodes.cached("4006381333931", now); ok {
		t.Fatal("ohne Antwort darf nichts gemerkt werden")
	}
}

func TestBarcodeUngueltigUndBremse(t *testing.T) {
	var calls atomic.Int32
	db := fakeDB(t, nil, &calls)
	defer db.Close()
	a := newBarcodeAPI(t, db.URL)
	if s, _, _ := call(a, "GET", "/api/barcode/4006381333932", testCode, nil); s != 400 {
		t.Fatalf("falsche Prüfziffer: %d", s)
	}
	if s, _, _ := call(a, "GET", "/api/barcode/4006381333931", "", nil); s != 401 {
		t.Fatalf("ohne Code: %d", s)
	}
	for i := 0; i < barcodeBurst; i++ {
		call(a, "GET", "/api/barcode/4006381333931", testCode, nil)
	}
	if s, _, _ := call(a, "GET", "/api/barcode/4006381333931", testCode, nil); s != 429 {
		t.Fatalf("nach %d Abfragen: %d", barcodeBurst, s)
	}
}

func TestInfoMeldetBarcode(t *testing.T) {
	_, out, _ := call(newTestAPI(t, ""), "GET", "/api/info", "", nil)
	f, _ := out["features"].([]any)
	if len(f) != 1 || f[0] != "barcode" {
		t.Fatalf("features = %v", out["features"])
	}
}

func TestScanCodeBleibtAufDemHandy(t *testing.T) {
	s, _ := openTemp(t)
	mustApply(t, s, chg("scan0001", "servings", "srv1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"scanCode": "4006381333931", "note": "x"}))
	if field(s, "servings", "srv1", "scanCode") != "<fehlt>" {
		t.Fatal("scanCode darf nicht auf dem Server landen")
	}
}

func TestUebersicht(t *testing.T) {
	s, dir := openTemp(t)
	ms := now.UnixMilli()
	mustApply(t, s,
		chg("ueber001", "pets", "pet1", clock(ms, 0, "handya"), map[string]any{"name": "Minka", "_del": false}),
		chg("ueber002", "pets", "pet2", clock(ms, 1, "handya"), map[string]any{"name": "Tiger", "_del": false}),
		chg("ueber003", "products", "prod1", clock(ms, 2, "handya"), map[string]any{"brand": "Sheba", "variety": "Lachs", "codes.4006381333931": true, "_del": false}),
		chg("ueber004", "servings", "srv1", clock(ms, 3, "handya"), map[string]any{"productId": "prod1", "servedAt": ms, "by": "Anna",
			"pets.pet1": map[string]any{"r": "gut", "by": "Anna"}, "pets.pet2": map[string]any{"r": nil}, "_del": false}),
		chg("ueber005", "pets", "pet3", clock(ms, 4, "handyb"), map[string]any{"name": "Weg", "_del": true}))
	s.Backup(now)
	out := Overview(s.st, dir, now)
	for _, want := range []string{"Tiere         2  Minka, Tiger", "Futter        1  davon 1 mit Barcode", "Mahlzeiten    1",
		"Sheba Lachs", "Minka: Gut, Tiger: offen", "4006381333931", "Anna (handya)", "Gerät handyb", "heute", "Letztes Backup: " + now.Format("02.01.2006")} {
		if !strings.Contains(out, want) {
			t.Errorf("Übersicht enthält %q nicht:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Weg") {
		t.Error("gelöschte Tiere gehören nicht in die Übersicht")
	}
}
