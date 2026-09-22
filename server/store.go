package main

// Storage: every record with one clock per field, persisted in a JSON file.
//
// A change sets individual fields of a record. Per field the larger timestamp wins
// (a hybrid clock as sortable text, see clockPattern). "_del" is an ordinary field:
// true = deleted, false = restored. Every accepted change increments the running
// number (seq); devices fetch "everything since N".
//
// The file is replaced in full and atomically on every change (write, fsync, rename).
// A crash mid-write always leaves either the old or the new version behind.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	backupDir     = "backups"
	keepBackups   = 30
	keepSeen      = 180 * 24 * time.Hour // how long the server recognises changes sent twice
	maxFutureSkew = 10 * time.Minute     // changes from the future are rejected
	maxFieldBytes = 512 << 10
	maxFields     = 64
)

var (
	collections  = map[string]bool{"pets": true, "products": true, "servings": true}
	localOnly    = map[string]bool{"photo": true, "status": true, "error": true, "autoPets": true, "scanCode": true} // stay on the phone
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
	S int64            `json:"s"` // number of the last accepted change
	F map[string]Field `json:"f"`
}

type state struct {
	Epoch   string                        `json:"epoch"`
	Seq     int64                         `json:"seq"`
	Records map[string]map[string]*Record `json:"records"`
	Seen    map[string]int64              `json:"seen"` // change id → timestamp in ms
}

// Change is a change the way a device sends it.
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

// OutRecord is a record the way devices receive it.
type OutRecord struct {
	C string           `json:"c"`
	R string           `json:"r"`
	S int64            `json:"s"`
	F map[string]Field `json:"f"`
}

type Store struct {
	mu  sync.Mutex
	dir string
	st  state
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
	for c := range collections {
		st.Records[c] = map[string]*Record{}
	}
	return st
}

// OpenStore loads the stored data. If the file is corrupted it is set aside and the newest
// backup is loaded, under a new epoch, so that every device does a full sync.
func OpenStore(dir string) (*Store, error) {
	s := &Store{dir: dir}
	if err := os.MkdirAll(filepath.Join(dir, backupDir), 0o700); err != nil {
		return nil, err
	}
	st, err := readState(filepath.Join(dir, stateFile))
	switch {
	case err == nil:
		s.st = st
	case errors.Is(err, os.ErrNotExist):
		s.st = emptyState()
		if err := s.persist(); err != nil {
			return nil, err
		}
	default:
		broken := filepath.Join(dir, fmt.Sprintf("state.defekt-%d.json", time.Now().Unix()))
		log.Printf("stored data corrupted (%v), setting it aside as %s", err, broken)
		if rerr := os.Rename(filepath.Join(dir, stateFile), broken); rerr != nil {
			return nil, rerr
		}
		s.st = emptyState()
		if b := newestBackup(dir); b != "" {
			if bst, berr := readState(b); berr == nil {
				bst.Epoch = newEpoch()
				s.st = bst
				log.Printf("Backup %s geladen", filepath.Base(b))
			}
		}
		if err := s.persist(); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func readState(path string) (state, error) {
	var st state
	raw, err := os.ReadFile(path)
	if err != nil {
		return st, err
	}
	if err := json.Unmarshal(raw, &st); err != nil {
		return st, err
	}
	if st.Epoch == "" || st.Records == nil {
		return st, errors.New("incomplete file")
	}
	for c := range collections {
		if st.Records[c] == nil {
			st.Records[c] = map[string]*Record{}
		}
	}
	if st.Seen == nil {
		st.Seen = map[string]int64{}
	}
	return st, nil
}

// writeAtomic replaces a file so that after a crash there is always a complete version.
func writeAtomic(path string, data []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	if d, err := os.Open(filepath.Dir(path)); err == nil {
		d.Sync()
		d.Close()
	}
	return nil
}

func (s *Store) persist() error {
	data, err := json.Marshal(s.st)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(s.dir, stateFile), data, 0o600)
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
	case !collections[c.C]:
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

// Apply accepts changes and persists them before returning.
// ok holds every id the device may drop from its queue (accepted or already known),
// rejected the permanently invalid ones.
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
		rec := recs[c.R]
		if rec == nil {
			rec = &Record{F: map[string]Field{}}
		}
		applied := false
		for k, v := range c.F {
			if c.C == "servings" && localOnly[k] {
				continue
			}
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
			// Back to the persisted state, so that memory and disk agree
			if st, rerr := readState(filepath.Join(s.dir, stateFile)); rerr == nil {
				s.st = st
			}
			return nil, nil, 0, err
		}
	}
	return ok, rejected, s.st.Seq, nil
}

// Since returns every record that has changed after the number since.
func (s *Store) Since(since int64) (epoch string, seq int64, out []OutRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out = []OutRecord{}
	for c, recs := range s.st.Records {
		for id, rec := range recs {
			if rec.S > since {
				out = append(out, OutRecord{C: c, R: id, S: rec.S, F: rec.F})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].S < out[j].S })
	return s.st.Epoch, s.st.Seq, out
}

// Checksum hashes every field and its clock. The app computes it the same way:
// SHA-256 over the sorted lines "collection/id/field@clock\n".
func (s *Store) Checksum() (epoch string, seq int64, sum string, fields int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lines := []string{}
	for c, recs := range s.st.Records {
		for id, rec := range recs {
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

// Products returns the visible food varieties, newest first (for the recognition prompt).
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

// Backup writes a copy once a day and keeps the last 30.
// It also drops change ids older than keepSeen.
func (s *Store) Backup(now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	name := filepath.Join(s.dir, backupDir, "state-"+now.Format("2006-01-02")+".json")
	if _, err := os.Stat(name); err == nil {
		return nil
	}
	cut := now.Add(-keepSeen).UnixMilli()
	for id, at := range s.st.Seen {
		if at < cut {
			delete(s.st.Seen, id)
		}
	}
	if err := s.persist(); err != nil {
		return err
	}
	data, err := os.ReadFile(filepath.Join(s.dir, stateFile))
	if err != nil {
		return err
	}
	if err := writeAtomic(name, data, 0o600); err != nil {
		return err
	}
	files, _ := filepath.Glob(filepath.Join(s.dir, backupDir, "state-*.json"))
	sort.Strings(files)
	for len(files) > keepBackups {
		os.Remove(files[0])
		files = files[1:]
	}
	return nil
}

func newestBackup(dir string) string {
	files, _ := filepath.Glob(filepath.Join(dir, backupDir, "state-*.json"))
	sort.Strings(files)
	if len(files) == 0 {
		return ""
	}
	return files[len(files)-1]
}
