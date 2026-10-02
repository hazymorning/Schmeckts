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

func newTestAPI(t *testing.T) *API {
	t.Helper()
	dir := t.TempDir()
	if err := writeConfig(dir, Config{Code: testCode, APIKey: "sk-ant-test"}); err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	photos, err := OpenPhotos(dir)
	if err != nil {
		t.Fatal(err)
	}
	a := NewAPI(s, NewConfigHolder(dir), photos)
	a.now = func() time.Time { return now }
	return a
}

func useAnthropic(t *testing.T, url string) {
	old := anthropicURL
	anthropicURL = url
	t.Cleanup(func() { anthropicURL = old })
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

func TestOnlyFromTheHomeNetwork(t *testing.T) {
	a := newTestAPI(t)
	for addr, want := range map[string]int{"8.8.8.8:1": 403, "192.168.178.30:1": 200, "10.8.0.2:1": 200, "100.70.1.2:1": 200, "[::1]:1": 200, "[2001:db8::1]:1": 403} {
		req := httptest.NewRequest("GET", "/api/info", nil)
		req.RemoteAddr = addr
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, req)
		if w.Code != want {
			t.Errorf("%s: %d, expected %d", addr, w.Code, want)
		}
	}
}

func TestCorsForTheApp(t *testing.T) {
	a := newTestAPI(t)
	status, _, h := call(a, "OPTIONS", "/api/changes", "", nil)
	if status != 204 || h.Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(h.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight: %d %v", status, h)
	}
}

func TestHouseholdCode(t *testing.T) {
	a := newTestAPI(t)
	if s, _, _ := call(a, "GET", "/api/changes", "", nil); s != 401 {
		t.Fatalf("without a code: %d", s)
	}
	if s, _, _ := call(a, "GET", "/api/changes", "k7pm 3qxd", nil); s != 200 {
		t.Fatalf("lower-case code with spaces: %d", s)
	}
	for i := 0; i < failLimit; i++ {
		call(a, "GET", "/api/changes", "FALSCH", nil)
	}
	if s, _, _ := call(a, "GET", "/api/changes", testCode, nil); s != 429 {
		t.Fatalf("after %d failed attempts: %d, expected a pause", failLimit, s)
	}
	a.now = func() time.Time { return now.Add(failWindow) }
	if s, _, _ := call(a, "GET", "/api/changes", testCode, nil); s != 200 || len(a.fails) != 0 {
		t.Fatalf("after the pause: %d, %d addresses still remembered", s, len(a.fails))
	}
	if s, _, _ := call(a, "GET", "/api/changes?code="+testCode, "", nil); s != 401 {
		t.Fatalf("code in the query outside /api/events: %d", s)
	}
}

func TestInfo(t *testing.T) {
	a := newTestAPI(t)
	_, out, _ := call(a, "GET", "/api/info", "", nil)
	if out["app"] != "schmeckts" || out["protocol"] != float64(1) || out["auth"] != nil || out["recognition"] != true {
		t.Fatalf("without a code: %v", out)
	}
	if f, _ := json.Marshal(out["features"]); string(f) != `["fed","photo","replace","collections"]` {
		t.Fatalf("features = %s", f)
	}
	_, out, _ = call(a, "GET", "/api/info", testCode, nil)
	if out["auth"] != true {
		t.Fatalf("with a code: %v", out)
	}
	_, out, _ = call(a, "GET", "/api/info", "FALSCH", nil)
	if out["auth"] != false || out["error"] == nil {
		t.Fatalf("wrong code: %v", out)
	}
}

func TestSyncBetweenTwoPhones(t *testing.T) {
	a := newTestAPI(t)
	ms := now.UnixMilli()
	status, res, _ := call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("anna0001", "pets", "pet1", clock(ms, 0, "anna"), map[string]any{"name": "Minka", "_del": false}),
	}})
	if status != 200 || len(res["ok"].([]any)) != 1 {
		t.Fatalf("sending: %d %v", status, res)
	}
	epoch := res["epoch"].(string)
	_, got, _ := call(a, "GET", "/api/changes?since=0", testCode, nil)
	recs := got["records"].([]any)
	if len(recs) != 1 {
		t.Fatalf("phone B sees %d records", len(recs))
	}
	seqB := int64(got["seq"].(float64))
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("jonas001", "pets", "pet2", clock(ms+1, 0, "jonas"), map[string]any{"name": "Tiger"}),
	}})
	_, got, _ = call(a, "GET", "/api/changes?since="+itoa(seqB)+"&epoch="+epoch, testCode, nil)
	if n := len(got["records"].([]any)); n != 1 {
		t.Fatalf("since %d: %d records, expected only the new one", seqB, n)
	}
	_, got, _ = call(a, "GET", "/api/changes?since="+itoa(seqB)+"&epoch=veraltet", testCode, nil)
	if n := len(got["records"].([]any)); n != 2 {
		t.Fatalf("foreign epoch: %d records, expected everything", n)
	}
	if got["now"] == nil {
		t.Fatal("every response needs the server time")
	}
}

func TestRejectedChangesAreReported(t *testing.T) {
	a := newTestAPI(t)
	future := now.Add(time.Hour).UnixMilli()
	_, res, _ := call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("zukunft1", "pets", "pet1", clock(future, 0, "anna"), map[string]any{"name": "x"}),
	}})
	rej := res["rejected"].([]any)
	if len(res["ok"].([]any)) != 0 || len(rej) != 1 || rej[0].(map[string]any)["reason"] != "clock" {
		t.Fatalf("%v", res)
	}
}

func TestChecksum(t *testing.T) {
	a := newTestAPI(t)
	_, before, _ := call(a, "GET", "/api/checksum", testCode, nil)
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("summe001", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"}),
	}})
	_, after, _ := call(a, "GET", "/api/checksum", testCode, nil)
	if before["sum"] == after["sum"] || after["fields"] != float64(1) {
		t.Fatalf("before %v, after %v", before, after)
	}
	// without ?c= only baseColls count
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("summe002", "observations", "obs1", clock(now.UnixMilli(), 1, "anna"), map[string]any{"kind": "tired"}),
	}})
	_, plain, _ := call(a, "GET", "/api/checksum", testCode, nil)
	_, named, _ := call(a, "GET", "/api/checksum?c=pets,products,servings,observations,bad!name", testCode, nil)
	if plain["sum"] != after["sum"] || named["fields"] != float64(2) {
		t.Fatalf("plain %v, named %v", plain, named)
	}
}

func TestLiveNotifications(t *testing.T) {
	a := newTestAPI(t)
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
		t.Fatalf("first notification: %q", first)
	}
	body, _ := json.Marshal(map[string]any{"changes": []Change{chg("live0001", "pets", "pet1", clock(now.UnixMilli(), 0, "anna"), map[string]any{"name": "Minka"})}})
	req, _ := http.NewRequest("POST", srv.URL+"/api/changes", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testCode)
	if r, err := http.DefaultClient.Do(req); err != nil || r.StatusCode != 200 {
		t.Fatalf("sending: %v", err)
	}
	if got := next(); !strings.Contains(got, `"seq":1`) {
		t.Fatalf("after the change: %q", got)
	}
}

func fakeAnthropic(t *testing.T, status int, reply string, seen *map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-ant-test" || r.Header.Get("anthropic-version") != anthropicVersion {
			t.Errorf("headers missing: %v", r.Header)
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

func TestRecognition(t *testing.T) {
	var sent map[string]any
	fake := fakeAnthropic(t, 200, "```json\n{\"brand\":\"Sheba \",\"variety\":\"Lachs in Soße\",\"type\":\"nassfutter\",\"animal\":\"Einhorn\"}\n```", &sent)
	defer fake.Close()
	useAnthropic(t, fake.URL)
	a := newTestAPI(t)
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
			t.Errorf("the request to Anthropic does not contain %s", want)
		}
	}
}

func TestRecognitionErrorsAndCostBrake(t *testing.T) {
	fake := fakeAnthropic(t, 401, "", nil)
	defer fake.Close()
	useAnthropic(t, fake.URL)
	a := newTestAPI(t)
	if s, out, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 502 || !strings.Contains(out["error"].(string), "abgelehnt") {
		t.Fatalf("rejected key: %d %v", s, out)
	}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": "kein-bild"}); s != 400 {
		t.Fatalf("broken photo: %d", s)
	}
	for i := 0; i < recognizeBurst; i++ {
		call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg})
	}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 429 {
		t.Fatalf("after %d recognitions in a row: %d, expected a brake", recognizeBurst, s)
	}
	a.now = func() time.Time { return now.Add(recognizeEvery + time.Second) }
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s == 429 {
		t.Fatal("after the pause a recognition must work again")
	}
}

func TestRecognitionWithoutAKey(t *testing.T) {
	a := newTestAPI(t)
	writeConfig(a.cfg.dir, Config{Code: testCode})
	a.cfg.mtime = time.Time{}
	if s, _, _ := call(a, "POST", "/api/recognize", testCode, map[string]any{"image": jpeg}); s != 503 {
		t.Fatalf("without a key: %d", s)
	}
}

func TestCheckingTheKey(t *testing.T) {
	ok := fakeAnthropic(t, 200, "", nil)
	defer ok.Close()
	bad := fakeAnthropic(t, 401, "", nil)
	defer bad.Close()
	useAnthropic(t, ok.URL)
	if err := CheckKey(t.Context(), Config{APIKey: "sk-ant-test"}); err != nil {
		t.Fatal(err)
	}
	useAnthropic(t, bad.URL)
	if err := CheckKey(t.Context(), Config{APIKey: "sk-ant-test"}); err == nil || !strings.Contains(err.Error(), "abgelehnt") {
		t.Fatalf("rejected key: %v", err)
	}
}

func TestCodeFormat(t *testing.T) {
	for i := 0; i < 200; i++ {
		c := newCode()
		if len(c) != 9 || c[4] != '-' || strings.ContainsAny(c, "01OI") {
			t.Fatalf("code %q", c)
		}
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }

func TestFedSince(t *testing.T) {
	a := newTestAPI(t)
	ms := now.UnixMilli()
	serve := func(id, product, by string, at int64, extra map[string]any) Change {
		f := map[string]any{"productId": product, "servedAt": at, "by": by, "pets": map[string]any{"pet1": map[string]any{"r": nil}}, "_del": false}
		for k, v := range extra {
			f[k] = v
		}
		return chg("change-"+id, "servings", id, clock(ms, 0, "anna"), f)
	}
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("change-snack", "products", "snack001", clock(ms, 0, "anna"), map[string]any{"type": "Snack", "variety": "Käse"}),
		chg("change-nass", "products", "nass0001", clock(ms, 0, "anna"), map[string]any{"type": "Nassfutter", "variety": "Lachs"}),
		serve("meal0001", "nass0001", "Anna", ms-5*3600000, nil),
		serve("meal0002", "snack001", "Jonas", ms-60000, nil),
		serve("meal0003", "nass0001", "Jonas", ms-30*60000, map[string]any{"_del": true}),
	}})
	ask := func(q string) (int, map[string]any) {
		status, out, _ := call(a, "GET", "/api/fed"+q, testCode, nil)
		return status, out
	}
	if s, out := ask("?since=" + itoa(ms-3600000)); s != 200 || out["fed"] != false || out["at"] != float64(0) {
		t.Fatalf("a treat and a deleted meal in the last hour are no meal: %d %v", s, out)
	}
	if _, out := ask("?since=" + itoa(ms-6*3600000)); out["fed"] != true || out["at"] != float64(ms-5*3600000) || out["by"] != "Anna" {
		t.Fatalf("the meal five hours ago: %v", out)
	}
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{serve("meal0004", "", "", ms-10*60000, nil)}})
	if _, out := ask("?since=" + itoa(ms-3600000)); out["fed"] != true || out["at"] != float64(ms-10*60000) || out["by"] != "" {
		t.Fatalf("a meal without a variety yet counts: %v", out)
	}
	for _, q := range []string{"", "?since=", "?since=gestern", "?since=-5"} {
		if s, _ := ask(q); s != 400 {
			t.Fatalf("%q: %d, expected 400", q, s)
		}
	}
	if s, _, _ := call(a, "GET", "/api/fed?since=1", "", nil); s != 401 {
		t.Fatalf("without a code: %d", s)
	}
}

func TestPhotos(t *testing.T) {
	a := newTestAPI(t)
	ms := now.UnixMilli()
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("change-lachs", "products", "lachs001", clock(ms, 0, "anna"), map[string]any{"variety": "Lachs", "_del": false}),
		chg("change-rind", "products", "rind0001", clock(ms, 0, "anna"), map[string]any{"variety": "Rind", "_del": true}),
	}})
	photo := func(b ...byte) map[string]string {
		return map[string]string{"image": base64.StdEncoding.EncodeToString(append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, b...))}
	}
	if s, _, _ := call(a, "GET", "/api/photo/lachs001", testCode, nil); s != 404 {
		t.Fatalf("no photo yet: %d, expected 404", s)
	}
	if s, out, _ := call(a, "POST", "/api/photo/lachs001", testCode, photo(1)); s != 200 || out["ok"] != true {
		t.Fatalf("keeping the photo: %d %v", s, out)
	}
	if s, _, _ := call(a, "POST", "/api/photo/lachs001", testCode, photo(2)); s != 200 {
		t.Fatalf("a second photo is no error: %d", s)
	}
	if s, out, _ := call(a, "GET", "/api/photo/lachs001", testCode, nil); s != 200 || out["image"] != photo(2)["image"] {
		t.Fatalf("the second photo replaces the first: %d %v", s, out)
	}
	for _, c := range []struct {
		path string
		body any
		want int
	}{
		{"/api/photo/rind0001", photo(1), 404},                               // a deleted variety
		{"/api/photo/unbekannt", photo(1), 404},                              // unknown variety
		{"/api/photo/x", photo(1), 400},                                      // not a variety id
		{"/api/photo/lachs001", map[string]string{"image": "aGFsbG8="}, 400}, // no JPEG
		{"/api/photo/lachs001", map[string]string{"image": "%%%"}, 400},      // no base64
		{"/api/photo/lachs001", photo(make([]byte, maxPhotoBytes)...), 413},  // too large
	} {
		if s, _, _ := call(a, "POST", c.path, testCode, c.body); s != c.want {
			t.Errorf("POST %s: %d, expected %d", c.path, s, c.want)
		}
	}
	if s, _, _ := call(a, "GET", "/api/photo/lachs001", "", nil); s != 401 {
		t.Fatalf("without a code: %d", s)
	}
	call(a, "POST", "/api/changes", testCode, map[string]any{"changes": []Change{
		chg("change-lachs-weg", "products", "lachs001", clock(ms+1, 0, "anna"), map[string]any{"_del": true}),
	}})
	a.photos.Sweep(a.store.Varieties())
	if s, _, _ := call(a, "GET", "/api/photo/lachs001", testCode, nil); s != 404 {
		t.Fatalf("a variety that is gone takes its photo along: %d", s)
	}
}
