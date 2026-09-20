package main

// Konfiguration des Servers in config.json im Datenordner. Nur der Serverdienst und root
// dürfen sie lesen, denn sie enthält den API-Schlüssel. Der Server liest sie neu, sobald
// sie sich ändert, ein Neustart ist nach dem Einrichten nicht nötig.

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	configFile   = "config.json"
	defaultModel = "claude-sonnet-5"
	defaultPort  = 8486
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // ohne 0/O und 1/I, gut abzutippen
)

type Config struct {
	APIKey       string   `json:"apiKey,omitempty"`
	Code         string   `json:"code,omitempty"`
	Model        string   `json:"model,omitempty"`
	Port         int      `json:"port,omitempty"`
	AnthropicURL string   `json:"anthropicUrl,omitempty"` // nur für Tests, sonst leer
	BarcodeURLs  []string `json:"barcodeUrls,omitempty"`  // nur für Tests, sonst Open Pet Food Facts und Open Food Facts
}

func (c Config) model() string {
	if c.Model != "" {
		return c.Model
	}
	return defaultModel
}

func (c Config) port() int {
	if c.Port > 0 {
		return c.Port
	}
	return defaultPort
}

func (c Config) anthropicURL() string {
	if c.AnthropicURL != "" {
		return strings.TrimRight(c.AnthropicURL, "/")
	}
	return "https://api.anthropic.com"
}

// normCode macht Eingaben wie „k7pm 3qxd“ oder „K7PM-3QXD“ vergleichbar.
func normCode(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '-' || r == ' ' {
			return -1
		}
		return r
	}, strings.ToUpper(strings.TrimSpace(s)))
}

func (c Config) codeMatches(given string) bool {
	want := normCode(c.Code)
	return want != "" && subtle.ConstantTimeCompare([]byte(want), []byte(normCode(given))) == 1
}

func newCode() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	out := make([]byte, 0, 9)
	for i, x := range b {
		if i == 4 {
			out = append(out, '-')
		}
		out = append(out, codeAlphabet[int(x)%len(codeAlphabet)])
	}
	return string(out)
}

func readConfig(dir string) (Config, error) {
	var c Config
	raw, err := os.ReadFile(filepath.Join(dir, configFile))
	if errors.Is(err, os.ErrNotExist) {
		return c, nil
	}
	if err != nil {
		return c, err
	}
	return c, json.Unmarshal(raw, &c)
}

func writeConfig(dir string, c Config) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(dir, configFile), append(data, '\n'), 0o600)
}

// ConfigHolder liefert die aktuelle Konfiguration und liest die Datei neu, wenn sie sich geändert hat.
type ConfigHolder struct {
	mu    sync.Mutex
	dir   string
	cfg   Config
	mtime time.Time
}

func NewConfigHolder(dir string) *ConfigHolder { return &ConfigHolder{dir: dir} }

func (h *ConfigHolder) Get() Config {
	h.mu.Lock()
	defer h.mu.Unlock()
	info, err := os.Stat(filepath.Join(h.dir, configFile))
	if err != nil {
		return h.cfg
	}
	if !info.ModTime().Equal(h.mtime) {
		if c, err := readConfig(h.dir); err == nil {
			h.cfg, h.mtime = c, info.ModTime()
		}
	}
	return h.cfg
}
