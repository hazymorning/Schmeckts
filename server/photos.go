package main

// Packaging photos, one file per variety in photos/, kept out of the synced data.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	photoDir      = "photos"
	maxPhotoBytes = 4 << 20
)

type Photos struct {
	mu  sync.Mutex
	dir string
}

func OpenPhotos(dir string) (*Photos, error) {
	p := &Photos{dir: filepath.Join(dir, photoDir)}
	if err := os.MkdirAll(p.dir, 0o700); err != nil {
		return nil, err
	}
	removeTemps(p.dir)
	return p, nil
}

func (p *Photos) file(id string) string {
	return filepath.Join(p.dir, id+".jpg")
}

func (p *Photos) Put(id string, jpeg []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return writeAtomic(p.file(id), jpeg)
}

func (p *Photos) Get(id string) ([]byte, error) {
	return os.ReadFile(p.file(id))
}

func (p *Photos) Sweep(varieties map[string]bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	files, _ := filepath.Glob(filepath.Join(p.dir, "*.jpg"))
	for _, f := range files {
		if !varieties[strings.TrimSuffix(filepath.Base(f), ".jpg")] {
			os.Remove(f)
		}
	}
}

func isJPEG(b []byte) bool {
	return bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF})
}
