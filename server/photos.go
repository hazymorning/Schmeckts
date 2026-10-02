package main

// Packaging photos, one file per variety in photos/, kept out of the synced data and the backups.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
)

const (
	photoDir      = "photos"
	maxPhotoBytes = 4 << 20
)

type Photos struct {
	dir string
}

func OpenPhotos(dir string) (*Photos, error) {
	p := &Photos{dir: filepath.Join(dir, photoDir)}
	return p, os.MkdirAll(p.dir, 0o700)
}

func (p *Photos) file(id string) string {
	return filepath.Join(p.dir, id+".jpg")
}

func (p *Photos) Put(id string, jpeg []byte) error {
	return writeAtomic(p.file(id), jpeg, 0o600)
}

func (p *Photos) Get(id string) ([]byte, error) {
	return os.ReadFile(p.file(id))
}

func (p *Photos) Sweep(varieties map[string]bool) {
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
