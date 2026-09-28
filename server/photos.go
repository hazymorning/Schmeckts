package main

// Packaging photos: the large photo a phone took of a variety, kept here so that every phone in the household can
// show it, not only the one that took it. One file per variety in photos/ beside the data, never part of the synced
// data nor of a backup. The first photo sent for a variety stays, and a variety that is gone takes its photo along.

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

// Put keeps the photo of a variety that has none yet; one it has already stays.
func (p *Photos) Put(id string, jpeg []byte) error {
	if _, err := os.Stat(p.file(id)); err == nil {
		return nil
	}
	return writeAtomic(p.file(id), jpeg, 0o600)
}

// Get is the photo of a variety, an error without one.
func (p *Photos) Get(id string) ([]byte, error) {
	return os.ReadFile(p.file(id))
}

// Sweep removes the photos of the varieties that are gone.
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
