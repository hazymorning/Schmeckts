package main

// HTTP API, private networks only. The household code comes as "Authorization: Bearer <code>",
// or as ?code= for /api/events.

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	protocolVersion = 1
	maxBodyBytes    = 12 << 20
	maxChanges      = 500
	failLimit       = 20 // wrong codes per address within failWindow before it is blocked
	failWindow      = 10 * time.Minute
	recognizeBurst  = 10 // cost brake for the paid API
	recognizeEvery  = 90 * time.Second
	pingEvery       = 25 * time.Second
)

var cgnat = netip.MustParsePrefix("100.64.0.0/10") // used by some VPNs

type API struct {
	store  *Store
	cfg    *ConfigHolder
	photos *Photos
	now    func() time.Time

	mu         sync.Mutex
	fails      map[string][]time.Time
	subs       map[chan struct{}]struct{}
	recognizes bucket
	closing    chan struct{}
	closeOnce  sync.Once
}

// bucket is a token bucket: burst in a row, then one per every.
type bucket struct {
	burst  float64
	every  time.Duration
	tokens float64
	last   time.Time
}

func newBucket(burst int, every time.Duration) bucket {
	return bucket{burst: float64(burst), every: every, tokens: float64(burst)}
}

func (b *bucket) take(now time.Time) bool {
	if !b.last.IsZero() {
		b.tokens = min(b.burst, b.tokens+now.Sub(b.last).Seconds()/b.every.Seconds())
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func NewAPI(store *Store, cfg *ConfigHolder, photos *Photos) *API {
	return &API{store: store, cfg: cfg, photos: photos, now: time.Now, fails: map[string][]time.Time{},
		subs:       map[chan struct{}]struct{}{},
		recognizes: newBucket(recognizeBurst, recognizeEvery),
		closing:    make(chan struct{})}
}

// Close ends the event streams, which would otherwise keep a graceful shutdown waiting.
func (a *API) Close() {
	a.closeOnce.Do(func() { close(a.closing) })
}

func (a *API) allow(b *bucket) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return b.take(a.now())
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/info", a.info)
	mux.HandleFunc("GET /api/changes", a.auth(a.getChanges))
	mux.HandleFunc("POST /api/changes", a.auth(a.postChanges))
	mux.HandleFunc("GET /api/checksum", a.auth(a.checksum))
	mux.HandleFunc("GET /api/events", a.auth(a.events))
	mux.HandleFunc("POST /api/recognize", a.auth(a.recognize))
	mux.HandleFunc("GET /api/fed", a.auth(a.fed))
	mux.HandleFunc("POST /api/photo/{id}", a.auth(a.putPhoto))
	mux.HandleFunc("GET /api/photo/{id}", a.auth(a.getPhoto))
	return a.guard(mux)
}

func remoteAddr(r *http.Request) netip.Addr {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	addr, _ := netip.ParseAddr(host)
	return addr.Unmap()
}

func privateAddr(a netip.Addr) bool {
	return a.IsValid() && (a.IsLoopback() || a.IsPrivate() || a.IsLinkLocalUnicast() || cgnat.Contains(a))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// The CORS headers are for the app, which runs under http://localhost.
func (a *API) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !privateAddr(remoteAddr(r)) {
			fail(w, http.StatusForbidden, "Nur aus dem Heimnetz erreichbar.")
			return
		}
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Max-Age", "86400")
		h.Set("Cache-Control", "no-store")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

func givenCode(r *http.Request) string {
	if v, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return v
	}
	if r.URL.Path == "/api/events" { // EventSource cannot send headers
		return r.URL.Query().Get("code")
	}
	return ""
}

func (a *API) checkCode(r *http.Request) (status int, msg string) {
	ip := remoteAddr(r).String()
	now := a.now()
	a.mu.Lock()
	for k, ts := range a.fails {
		ts = slices.DeleteFunc(ts, func(t time.Time) bool { return now.Sub(t) >= failWindow })
		if len(ts) == 0 {
			delete(a.fails, k)
		} else {
			a.fails[k] = ts
		}
	}
	locked := len(a.fails[ip]) >= failLimit
	a.mu.Unlock()
	if locked {
		return http.StatusTooManyRequests, "Zu viele falsche Versuche. Bitte in zehn Minuten nochmal."
	}
	cfg := a.cfg.Get()
	if cfg.Code == "" {
		return http.StatusServiceUnavailable, "Der Server ist noch nicht eingerichtet."
	}
	if !cfg.codeMatches(givenCode(r)) {
		a.mu.Lock()
		a.fails[ip] = append(a.fails[ip], now)
		a.mu.Unlock()
		return http.StatusUnauthorized, "Der Haushaltscode stimmt nicht."
	}
	return http.StatusOK, ""
}

func (a *API) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if status, msg := a.checkCode(r); status != http.StatusOK {
			fail(w, status, msg)
			return
		}
		next(w, r)
	}
}

func (a *API) info(w http.ResponseWriter, r *http.Request) {
	epoch, seq := a.store.Seq()
	out := map[string]any{"app": "schmeckts", "version": version, "protocol": protocolVersion,
		"epoch": epoch, "seq": seq, "now": a.now().UnixMilli(), "recognition": a.cfg.Get().APIKey != "",
		"features": []string{"fed", "photo", "replace", "collections"}}
	if givenCode(r) != "" {
		status, msg := a.checkCode(r)
		out["auth"] = status == http.StatusOK
		if msg != "" {
			out["error"] = msg
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) getChanges(w http.ResponseWriter, r *http.Request) {
	since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	epoch, _ := a.store.Seq()
	if e := r.URL.Query().Get("epoch"); e != "" && e != epoch {
		since = 0 // different data, after a restore for instance: send everything
	}
	epoch, seq, recs := a.store.Since(since)
	writeJSON(w, http.StatusOK, map[string]any{"epoch": epoch, "seq": seq, "now": a.now().UnixMilli(), "records": recs})
}

func (a *API) postChanges(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Changes []Change `json:"changes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			fail(w, http.StatusRequestEntityTooLarge, "Zu viele Daten auf einmal.")
			return
		}
		fail(w, http.StatusBadRequest, "Ungültige Anfrage.")
		return
	}
	if len(body.Changes) > maxChanges {
		fail(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("Höchstens %d Änderungen pro Anfrage.", maxChanges))
		return
	}
	epoch, before := a.store.Seq()
	ok, rejected, seq, err := a.store.Apply(body.Changes, a.now())
	if err != nil {
		log.Printf("Speichern fehlgeschlagen: %v", err)
		fail(w, http.StatusInternalServerError, "Der Server konnte nicht speichern.")
		return
	}
	for _, rj := range rejected {
		log.Printf("change %s rejected: %s (%s)", rj.ID, rj.Reason, rj.Detail)
	}
	if seq != before {
		a.notify()
	}
	writeJSON(w, http.StatusOK, map[string]any{"epoch": epoch, "seq": seq, "now": a.now().UnixMilli(), "ok": ok, "rejected": rejected})
}

func (a *API) checksum(w http.ResponseWriter, r *http.Request) {
	var colls []string // nil means baseColls
	if q := r.URL.Query().Get("c"); q != "" {
		colls = []string{}
		for _, c := range strings.Split(q, ",") {
			if collRe.MatchString(c) {
				colls = append(colls, c)
			}
		}
	}
	epoch, seq, sum, n := a.store.Checksum(colls)
	writeJSON(w, http.StatusOK, map[string]any{"epoch": epoch, "seq": seq, "now": a.now().UnixMilli(), "sum": sum, "fields": n})
}

func (a *API) notify() {
	a.mu.Lock()
	defer a.mu.Unlock()
	for ch := range a.subs {
		select {
		case ch <- struct{}{}:
		default: // a notice is already queued
		}
	}
}

func (a *API) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, http.StatusInternalServerError, "Live-Meldungen nicht möglich.")
		return
	}
	ch := make(chan struct{}, 1)
	a.mu.Lock()
	a.subs[ch] = struct{}{}
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.subs, ch)
		a.mu.Unlock()
	}()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	send := func() bool {
		epoch, seq := a.store.Seq()
		_, err := fmt.Fprintf(w, "event: seq\ndata: {\"epoch\":%q,\"seq\":%d}\n\n", epoch, seq)
		flusher.Flush()
		return err == nil
	}
	if !send() {
		return
	}
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-a.closing:
			return
		case <-ch:
			if !send() {
				return
			}
		case <-ping.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (a *API) recognize(w http.ResponseWriter, r *http.Request) {
	cfg := a.cfg.Get()
	if cfg.APIKey == "" {
		fail(w, http.StatusServiceUnavailable, "Auf dem Server ist noch kein API-Schlüssel eingerichtet.")
		return
	}
	var body struct {
		Image string `json:"image"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Image == "" {
		fail(w, http.StatusBadRequest, "Kein Foto in der Anfrage.")
		return
	}
	if !a.allow(&a.recognizes) {
		fail(w, http.StatusTooManyRequests, "Gerade sehr viele Erkennungen. Bitte in ein paar Minuten nochmal.")
		return
	}
	res, err := Recognize(r.Context(), cfg, body.Image, a.store.Products(60))
	if err != nil {
		var re *recognizeError
		if errors.As(err, &re) {
			log.Printf("Erkennung: %s", re.msg)
			fail(w, re.status, re.msg)
			return
		}
		fail(w, http.StatusBadGateway, "Die Erkennung ist fehlgeschlagen.")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (a *API) fed(w http.ResponseWriter, r *http.Request) {
	since, err := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	if err != nil || since <= 0 {
		fail(w, http.StatusBadRequest, "Ungültige Anfrage.")
		return
	}
	at, by := a.store.LastMeal(since)
	writeJSON(w, http.StatusOK, map[string]any{"fed": at > 0, "at": at, "by": by})
}

func (a *API) putPhoto(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Image string `json:"image"`
	}
	if !recordIDRe.MatchString(id) || json.NewDecoder(r.Body).Decode(&body) != nil {
		fail(w, http.StatusBadRequest, "Ungültige Anfrage.")
		return
	}
	data, err := base64.StdEncoding.DecodeString(body.Image)
	if err != nil || !isJPEG(data) {
		fail(w, http.StatusBadRequest, "Kein Foto in der Anfrage.")
		return
	}
	if len(data) > maxPhotoBytes {
		fail(w, http.StatusRequestEntityTooLarge, "Das Foto ist zu groß.")
		return
	}
	if !a.store.Variety(id) {
		fail(w, http.StatusNotFound, "Diese Sorte gibt es auf dem Server nicht.")
		return
	}
	if err := a.photos.Put(id, data); err != nil {
		log.Printf("Foto speichern fehlgeschlagen: %v", err)
		fail(w, http.StatusInternalServerError, "Der Server konnte das Foto nicht speichern.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) getPhoto(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !recordIDRe.MatchString(id) {
		fail(w, http.StatusBadRequest, "Ungültige Anfrage.")
		return
	}
	data, err := a.photos.Get(id)
	if err != nil {
		fail(w, http.StatusNotFound, "Für diese Sorte liegt kein Foto auf dem Server.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"image": base64.StdEncoding.EncodeToString(data)})
}
