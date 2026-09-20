package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testCode = "K7PM-3QXD"

var jpeg = base64.StdEncoding.EncodeToString([]byte{0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3})

func newTestAPI(t *testing.T, anthropic string) *API {
	t.Helper()
	dir := t.TempDir()
	if err := writeConfig(dir, Config{Code: testCode, APIKey: "sk-ant-test", AnthropicURL: anthropic}); err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	a := NewAPI(s, NewConfigHolder(dir), OpenBarcodes(dir))
	a.now = func() time.Time { return now }
	return a
}

func call(a *API, method, path, code string, body any) (int, map[string]any, http.Header) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rd)
	req.RemoteAddr = "192.168.178.30:40000"
	if code != "" {
		req.Header.Set("Authorization", "Bearer "+code)
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	out := map[string]any{}
	json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out, w.Header()
}

func TestNurAusDemHeimnetz(t *testing.T) {
	a := newTestAPI(t, "")
	for addr, want := range map[string]int{"8.8.8.8:1": 403, "192.168.178.30:1": 200, "10.8.0.2:1": 200, "100.70.1.2:1": 200, "[::1]:1": 200, "[2001:db8::1]:1": 403} {
		req := httptest.NewRequest("GET", "/api/info", nil)
		req.RemoteAddr = addr
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, req)
		if w.Code != want {
			t.Errorf("%s: %d, erwartet %d", addr, w.Code, want)
		}
	}
}

func TestCorsFuerDieApp(t *testing.T) {
	a := newTestAPI(t, "")
	status, _, h := call(a, "OPTIONS", "/api/changes", "", nil)
	if status != 204 || h.Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(h.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("Vorabanfrage: %d %v", status, h)
	}
}

func TestHaushaltscode(t *testing.T) {
	a := newTestAPI(t, "")
	if s, _, _ := call(a, "GET", "/api/changes", "", nil); s != 401 {
		t.Fatalf("ohne Code: %d", s)
	}
	if s, _, _ := call(a, "GET", "/api/changes", "k7pm 3qxd", nil); s != 200 {
		t.Fatalf("Code in Kleinbuchstaben mit Leerzeichen: %d", s)
	}
	for i := 0; i < failLimit; i++ {
		call(a, "GET", "/api/changes", "FALSCH", nil)
	}
	if s, _, _ := call(a, "GET", "/api/changes", testCode, nil); s != 429 {
		t.Fatalf("nach %d Fehlversuchen: %d, erwartet eine Pause", failLimit, s)
	}
}

func TestInfo(t *testing.T) {
	a := newTestAPI(t, "")
	_, out, _ := call(a, "GET", "/api/info", "", nil)
	if out["app"] != "schmeckts" || out["protocol"] != float64(1) || out["auth"] != nil || out["recognition"] != true {
		t.Fatalf("ohne Code: %v", out)
	}
	_, out, _ = call(a, "GET", "/api/info", testCode, nil)
	if out["auth"] != true {
		t.Fatalf("mit Code: %v", out)
	}
	_, out, _ = call(a, "GET", "/api/info", "FALSCH", nil)
	if out["auth"] != false || out["error"] == nil {
		t.Fatalf("falscher Code: %v", out)
	}
}

func TestAbgleichZwischenZweiHandys(t *testing.T) {
	a := newTestAPI(t, "")
	ms := now.UnixMilli()
	status, res, _ := call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("anna0001", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka", "_del": false}),
	}})
	if status != 200 || len(res["ok"].([]any)) != 1 {
		t.Fatalf("senden: %d %v", status, res)
	}
	epoch := res["epoch"].(string)
	_, got, _ := call(a, "GET", "/api/changes?since=0", testCode, nil)
	recs := got["records"].([]any)
	if len(recs) != 1 {
		t.Fatalf("Handy B sieht %d Datensätze", len(recs))
	}
	seqB := int64(got["seq"].(float64))
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("jonas001", "pets", "pet2", clock(ms+1, 0, "jonas"), map[string]any{"name": "Tiger"}),
	}})
	_, got, _ = call(a, "GET", "/api/changes?since="+itoa(seqB)+"&epoch="+epoch, testCode, nil)
	if n := len(got["records"].([]any)); n != 1 {
		t.Fatalf("seit %d: %d Datensätze, erwartet nur den neuen", seqB, n)
	}
	_, got, _ = call(a, "GET", "/api/changes?since="+itoa(seqB)+"&epoch=veraltet", testCode, nil)
	if n := len(got["records"].([]any)); n != 2 {
		t.Fatalf("fremde Epoche: %d Datensätze, erwartet alles", n)
	}
	if got["now"] == nil {
		t.Fatal("jede Antwort braucht die Serverzeit")
	}
}

func TestAbgelehnteAenderungenWerdenGemeldet(t *testing.T) {
	a := newTestAPI(t, "")
	future := now.Add(time.Hour).UnixMilli()
	_, res, _ := call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("zukunft1", "pets", "pet1", clock(future, 0, "anna"), map[string]any{"name": "x"}),
	}})
	rej := res["rejected"].([]any)
	if len(res["ok"].([]any)) != 0 || len(rej) != 1 || rej[0].(map[string]any)["reason"] != "clock" {
		t.Fatalf("%v", res)
	}
}

func TestPruefsumme(t *testing.T) {
	a := newTestAPI(t, "")
	_, before, _ := call(a, "GET", "/api/checksum", testCode, nil)
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("summe001", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}),
	}})
	_, after, _ := call(a, "GET", "/api/checksum", testCode, nil)
	if before["sum"] == after["sum"] || after["fields"] != float64(1) {
		t.Fatalf("vorher %v, nachher %v", before, after)
	}
}

func TestLiveMeldungen(t *testing.T) {
	a := newTestAPI(t, "")
	srv := httptest.NewServer(a.Handler())
	defer srv.Close()
	res, err := http.Get(srv.URL + "/api/events?code=" + testCode)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	lines := bufio.NewScanner(res.Body)
	next := func() string {
		for lines.Scan() {
			if l := lines.Text(); strings.HasPrefix(l, "data: ") {
				return l
			}
		}
		return ""
	}
	if first := next(); !strings.Contains(first, `"seq":0`) {
		t.Fatalf("erste Meldung: %q", first)
	}
	body, _ := json.Marshal(map[string]any{"changes": []Change{chg("live0001", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"})}})
	req, _ := http.NewRequest("POST", srv.URL+"/api/changes", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testCode)
	if r, err := http.DefaultClient.Do(req); err != nil || r.StatusCode != 200 {
		t.Fatalf("senden: %v", err)
	}
	if got := next(); !strings.Contains(got, `"seq":1`) {
		t.Fatalf("nach der Änderung: %q", got)
	}
}

func fakeAnthropic(t *testing.T, status int, reply string, seen *map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-ant-test" || r.Header.Get("anthropic-version") != anthropicVersion {
			t.Errorf("Header fehlen: %v", r.Header)
		}
		if r.URL.Path == "/v1/models" {
			w.WriteHeader(status)
			return
		}
		if seen != nil {
			json.NewDecoder(r.Body).Decode(seen)
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": reply}}})
	}))
}

func TestErkennung(t *testing.T) {
	var sent map[string]any
	fake := fakeAnthropic(t, 200, "```json\n{\"brand\":\"Sheba \",\"variety\":\"Lachs in Soße\",\"type\":\"nassfutter\",\"animal\":\"Einhorn\"}\n```", &sent)
	defer fake.Close()
	a := newTestAPI(t, fake.URL)
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("prod0001", "products", "prod1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"brand": "Felix", "variety": "Huhn in Gelee", "createdAt": 1}),
	}})
	status, out, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg})
	if status != 200 || out["brand"] != "Sheba" || out["variety"] != "Lachs in Soße" || out["type"] != "Nassfutter" || out["animal"] != "" {
		t.Fatalf("%d %v", status, out)
	}
	msg, _ := json.Marshal(sent)
	for _, want := range []string{`"model":"claude-sonnet-5"`, `"media_type":"image/jpeg"`, "Felix | Huhn in Gelee"} {
		if !strings.Contains(string(msg), want) {
			t.Errorf("Anfrage an Anthropic enthält %s nicht", want)
		}
	}
}

func TestErkennungFehlerUndKostenbremse(t *testing.T) {
	fake := fakeAnthropic(t, 401, "", nil)
	defer fake.Close()
	a := newTestAPI(t, fake.URL)
	if s, out, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 502 || !strings.Contains(out["error"].(string), "abgelehnt") {
		t.Fatalf("abgelehnter Schlüssel: %d %v", s, out)
	}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": "kein-bild"}); s != 400 {
		t.Fatalf("kaputtes Foto: %d", s)
	}
	for i := 0; i < recognizeBurst; i++ {
		call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg})
	}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 429 {
		t.Fatalf("nach %d Erkennungen am Stück: %d, erwartet eine Bremse", recognizeBurst, s)
	}
	a.now = func() time.Time { return now.Add(recognizeEvery + time.Second) }
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s == 429 {
		t.Fatal("nach der Pause muss wieder eine Erkennung gehen")
	}
}

func TestErkennungOhneSchluessel(t *testing.T) {
	a := newTestAPI(t, "")
	writeConfig(a.cfg.dir, Config{Code: testCode})
	a.cfg.mtime = time.Time{}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 503 {
		t.Fatalf("ohne Schlüssel: %d", s)
	}
}

func TestSchluesselPruefen(t *testing.T) {
	ok := fakeAnthropic(t, 200, "", nil)
	defer ok.Close()
	bad := fakeAnthropic(t, 401, "", nil)
	defer bad.Close()
	if err := CheckKey(t.Context(), Config{APIKey: "sk-ant-test", AnthropicURL: ok.URL}); err != nil {
		t.Fatal(err)
	}
	if err := CheckKey(t.Context(), Config{APIKey: "sk-ant-test", AnthropicURL: bad.URL}); err == nil || !strings.Contains(err.Error(), "abgelehnt") {
		t.Fatalf("abgelehnter Schlüssel: %v", err)
	}
}

func TestCodeFormat(t *testing.T) {
	for i := 0; i < 200; i++ {
		c := newCode()
		if len(c) != 9 || c[4] != '-' || strings.ContainsAny(c, "01OI") {
			t.Fatalf("Code %q", c)
		}
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }
