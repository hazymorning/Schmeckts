package main

// Records with one clock per field; per field the larger clock wins. "_del" is an ordinary field
// (true deleted, false restored). Each accepted change bumps seq, and devices fetch everything since N.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	stateFile     = "state.json"
	keepSeen      = 180 * 24 * time.Hour // how long the server recognises changes sent twice
	maxFutureSkew = 10 * time.Minute     // changes from the future are rejected
	maxFieldBytes = 512 << 10
	maxFields     = 64
	maxColls      = 16 // baseColls included
)

var (
	// other collections matching collRe are kept as well, so a new kind of data in the app needs no new server
	baseColls    = []string{"pets", "products", "servings"}
	collRe       = regexp.MustCompile(`^[a-z][A-Za-z0-9]{1,23}$`)
	changeIDRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
	recordIDRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{4,40}$`)
	fieldRe      = regexp.MustCompile(`^(_del|[A-Za-z][A-Za-z0-9]{0,31})(\.[A-Za-z0-9_-]{1,40})?$`)
	clockPattern = regexp.MustCompile(`^(\d{13})-(\d{4})-([a-z0-9]{4,16})$`)
)

type Field struct {
	V json.RawMessage `json:"v"`
	T string          `json:"t"`
}

type Record struct {
	S int64            `json:"s"` // seq of the last accepted change
	F map[string]Field `json:"f"`
}

type state struct {
	Epoch   string                        `json:"epoch"`
	Seq     int64                         `json:"seq"`
	Records map[string]map[string]*Record `json:"records"`
	Seen    map[string]int64              `json:"seen"` // change id → timestamp in ms
}

type Change struct {
	ID string                     `json:"id"`
	C  string                     `json:"c"`
	R  string                     `json:"r"`
	T  string                     `json:"t"`
	F  map[string]json.RawMessage `json:"f"`
}

type Rejected struct {
	ID     string `json:"id"`
	Reason string `json:"reason"` // "invalid" or "clock"
	Detail string `json:"detail"`
}

type OutRecord struct {
	C string           `json:"c"`
	R string           `json:"r"`
	S int64            `json:"s"`
	F map[string]Field `json:"f"`
}

type Store struct {
	mu    sync.Mutex
	dir   string
	st    state
	saved []byte // the state on disk, for a rollback that does not depend on reading it back
}

func newEpoch() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func emptyState() state {
	st := state{Epoch: newEpoch(), Records: map[string]map[string]*Record{}, Seen: map[string]int64{}}
	for _, c := range baseColls {
		st.Records[c] = map[string]*Record{}
	}
	return st
}

// An unreadable file is set aside and the store starts empty under a new epoch; the phones then send
// everything they hold again.
func OpenStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	removeTemps(dir)
	s := &Store{dir: dir}
	path := filepath.Join(dir, stateFile)
	raw, err := os.ReadFile(path)
	if err == nil {
		if s.st, err = parseState(raw); err == nil {
			s.saved = raw
			return s, nil
		}
	}
	if !errors.Is(err, os.ErrNotExist) {
		aside := filepath.Join(dir, "state-unreadable-"+time.Now().Format("20060102-150405")+".json")
		if rerr := os.Rename(path, aside); rerr != nil {
			return nil, rerr
		}
		log.Printf("%s nicht lesbar (%v), beiseitegelegt als %s, die Handys senden ihre Daten neu", stateFile, err, filepath.Base(aside))
	}
	s.st = emptyState()
	if err := s.persist(); err != nil {
		return nil, err
	}
	return s, nil
}

func parseState(raw []byte) (state, error) {
	var st state
	if err := json.Unmarshal(raw, &st); err != nil {
		return st, err
	}
	if st.Epoch == "" || st.Records == nil {
		return st, errors.New("incomplete file")
	}
	for _, c := range baseColls {
		if st.Records[c] == nil {
			st.Records[c] = map[string]*Record{}
		}
	}
	if st.Seen == nil {
		st.Seen = map[string]int64{}
	}
	return st, nil
}

// writeAtomic leaves the file 0600, as os.CreateTemp makes it.
func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	f, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*.tmp")
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(f.Name(), path)
	}
	if err != nil {
		os.Remove(f.Name())
		return err
	}
	if d, err := os.Open(dir); err == nil {
		d.Sync()
		d.Close()
	}
	return nil
}

// removeTemps clears what writeAtomic left behind in a crash.
func removeTemps(dir string) {
	files, _ := filepath.Glob(filepath.Join(dir, ".*.tmp"))
	for _, f := range files {
		os.Remove(f)
	}
}

func (s *Store) persist() error {
	data, err := json.Marshal(s.st)
	if err != nil {
		return err
	}
	if err := writeAtomic(filepath.Join(s.dir, stateFile), data); err != nil {
		return err
	}
	s.saved = data
	return nil
}

func parseClock(t string) (time.Time, bool) {
	m := clockPattern.FindStringSubmatch(t)
	if m == nil {
		return time.Time{}, false
	}
	ms, _ := strconv.ParseInt(m[1], 10, 64)
	return time.UnixMilli(ms), true
}

func validate(c Change, now time.Time) *Rejected {
	bad := func(detail string) *Rejected { return &Rejected{ID: c.ID, Reason: "invalid", Detail: detail} }
	switch {
	case !changeIDRe.MatchString(c.ID):
		return bad("change id")
	case !collRe.MatchString(c.C):
		return bad("collection " + c.C)
	case !recordIDRe.MatchString(c.R):
		return bad("record id")
	case len(c.F) == 0 || len(c.F) > maxFields:
		return bad("number of fields")
	}
	at, ok := parseClock(c.T)
	if !ok {
		return bad("timestamp")
	}
	if at.After(now.Add(maxFutureSkew)) {
		return &Rejected{ID: c.ID, Reason: "clock", Detail: "timestamp lies in the future"}
	}
	for k, v := range c.F {
		if !fieldRe.MatchString(k) || len(v) > maxFieldBytes || !json.Valid(v) {
			return bad("field " + k)
		}
		if k == "_del" && string(v) != "true" && string(v) != "false" {
			return bad("_del must be true or false")
		}
	}
	return nil
}

// Apply persists before it returns. ok holds every id the device may drop from its queue,
// accepted or already known; rejected holds the invalid ones.
func (s *Store) Apply(changes []Change, now time.Time) (ok []string, rejected []Rejected, seq int64, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ok, rejected = []string{}, []Rejected{}
	dirty := false
	for _, c := range changes {
		if r := validate(c, now); r != nil {
			rejected = append(rejected, *r)
			continue
		}
		if _, dup := s.st.Seen[c.ID]; dup {
			ok = append(ok, c.ID)
			continue
		}
		recs := s.st.Records[c.C]
		if recs == nil {
			if len(s.st.Records) >= maxColls {
				rejected = append(rejected, Rejected{ID: c.ID, Reason: "invalid", Detail: "too many collections"})
				continue
			}
			recs = map[string]*Record{}
			s.st.Records[c.C] = recs
		}
		rec := recs[c.R]
		if rec == nil {
			rec = &Record{F: map[string]Field{}}
		}
		applied := false
		for k, v := range c.F {
			if cur, has := rec.F[k]; has && cur.T >= c.T {
				continue
			}
			rec.F[k] = Field{V: v, T: c.T}
			applied = true
		}
		if applied {
			s.st.Seq++
			rec.S = s.st.Seq
			recs[c.R] = rec
		}
		s.st.Seen[c.ID] = now.UnixMilli()
		ok = append(ok, c.ID)
		dirty = true
	}
	if dirty {
		if err := s.persist(); err != nil {
			if st, perr := parseState(s.saved); perr == nil {
				s.st = st
			}
			return nil, nil, 0, err
		}
	}
	return ok, rejected, s.st.Seq, nil
}

func (s *Store) Since(since int64) (epoch string, seq int64, out []OutRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out = []OutRecord{}
	for c, recs := range s.st.Records {
		for id, rec := range recs {
			if rec.S > since {
				out = append(out, OutRecord{C: c, R: id, S: rec.S, F: maps.Clone(rec.F)}) // Apply writes to rec.F after the unlock
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].S < out[j].S })
	return s.st.Epoch, s.st.Seq, out
}

// Checksum must match the app's: SHA-256 over the sorted lines "collection/id/field@clock\n".
// Without colls it covers baseColls, so an app that lacks a newer collection can still compare.
func (s *Store) Checksum(colls []string) (epoch string, seq int64, sum string, fields int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if colls == nil {
		colls = baseColls
	}
	lines := []string{}
	seen := map[string]bool{}
	for _, c := range colls {
		if seen[c] {
			continue
		}
		seen[c] = true
		for id, rec := range s.st.Records[c] {
			for k, f := range rec.F {
				lines = append(lines, c+"/"+id+"/"+k+"@"+f.T+"\n")
			}
		}
	}
	sort.Strings(lines)
	h := sha256.New()
	for _, l := range lines {
		h.Write([]byte(l))
	}
	return s.st.Epoch, s.st.Seq, hex.EncodeToString(h.Sum(nil)), len(lines)
}

func (s *Store) Seq() (string, int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.st.Epoch, s.st.Seq
}

func (s *Store) Products(limit int) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	type item struct {
		name    string
		created float64
	}
	items := []item{}
	for _, rec := range s.st.Records["products"] {
		if del, ok := rec.F["_del"]; ok && string(del.V) == "true" {
			continue
		}
		var brand, variety string
		var created float64
		json.Unmarshal(rec.F["brand"].V, &brand)
		json.Unmarshal(rec.F["variety"].V, &variety)
		json.Unmarshal(rec.F["createdAt"].V, &created)
		if brand = strings.TrimSpace(brand); brand != "" || strings.TrimSpace(variety) != "" {
			items = append(items, item{brand + " | " + strings.TrimSpace(variety), created})
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].created > items[j].created })
	names := []string{}
	for i := 0; i < len(items) && i < limit; i++ {
		names = append(names, items[i].name)
	}
	return names
}

func (s *Store) Variety(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec := s.st.Records["products"][id]
	return rec != nil && string(rec.F["_del"].V) != "true"
}

// Deleted varieties. Unknown ones do not count: after a reset the phones bring them back.
func (s *Store) DeletedVarieties() map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]bool{}
	for id, rec := range s.st.Records["products"] {
		if string(rec.F["_del"].V) == "true" {
			out[id] = true
		}
	}
	return out
}

// LastMeal leaves treats out but, like the app, counts meals of unknown or deleted varieties. at is in ms.
func (s *Store) LastMeal(since int64) (at int64, by string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snacks := map[string]bool{}
	for id, rec := range s.st.Records["products"] {
		var kind string
		json.Unmarshal(rec.F["type"].V, &kind)
		snacks[id] = kind == "Snack"
	}
	for _, rec := range s.st.Records["servings"] {
		var served float64
		var product, name string
		json.Unmarshal(rec.F["servedAt"].V, &served)
		json.Unmarshal(rec.F["productId"].V, &product)
		if string(rec.F["_del"].V) == "true" || int64(served) < since || int64(served) <= at || snacks[product] {
			continue
		}
		json.Unmarshal(rec.F["by"].V, &name)
		at, by = int64(served), strings.TrimSpace(name)
	}
	return at, by
}

// PruneSeen forgets change ids older than keepSeen.
func (s *Store) PruneSeen(now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cut := now.Add(-keepSeen).UnixMilli()
	n := len(s.st.Seen)
	maps.DeleteFunc(s.st.Seen, func(_ string, at int64) bool { return at < cut })
	if len(s.st.Seen) == n {
		return nil
	}
	return s.persist()
}
