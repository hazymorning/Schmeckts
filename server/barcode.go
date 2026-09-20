package main

// Barcode-Suche: Futter anhand der EAN in Open Pet Food Facts und Open Food Facts nachschlagen.
// Die App fragt nur hier; die Ergebnisse merkt sich der Server in barcodes.json
// (Treffer 90 Tage, kein Treffer 7 Tage). Die eigentliche Zuordnung Code → Sorte speichert
// die App in der Futtersorte (Feld codes.<EAN>); diese Suche ist nur für unbekannte Codes.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	barcodeFile      = "barcodes.json"
	keepFound        = 90 * 24 * time.Hour
	keepNotFound     = 7 * 24 * time.Hour
	barcodeUserAgent = "Schmeckts/1.1 (private Haushalts-App)"
)

var (
	barcodeTimeout     = 5 * time.Second // je Datenbank; in Tests kürzer
	defaultBarcodeURLs = []string{"https://world.openpetfoodfacts.org", "https://world.openfoodfacts.org"}
	quantityRe         = regexp.MustCompile(`(?i)\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b|\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b`)
	spacesRe           = regexp.MustCompile(`\s+`)
)

// Product ist das Ergebnis einer Suche, so wie es die App bekommt.
type Product struct {
	Found   bool   `json:"found"`
	Brand   string `json:"brand,omitempty"`
	Variety string `json:"variety,omitempty"`
	Type    string `json:"type,omitempty"`
	Animal  string `json:"animal,omitempty"`
	At      int64  `json:"at,omitempty"` // nur im Zwischenspeicher: wann nachgeschlagen
}

// NormalizeCode lässt nur gültige EAN-13, EAN-8 und UPC-A zu. UPC-A wird zu EAN-13 mit führender 0.
func NormalizeCode(raw string) (string, bool) {
	code := strings.TrimSpace(raw)
	for _, r := range code {
		if r < '0' || r > '9' {
			return "", false
		}
	}
	if len(code) == 12 {
		code = "0" + code
	}
	if len(code) != 8 && len(code) != 13 {
		return "", false
	}
	sum := 0
	for i := len(code) - 2; i >= 0; i-- { // von rechts: abwechselnd Gewicht 3 und 1
		w := 1
		if (len(code)-2-i)%2 == 0 {
			w = 3
		}
		sum += int(code[i]-'0') * w
	}
	return code, (10-sum%10)%10 == int(code[len(code)-1]-'0')
}

// Barcodes schlägt Codes nach und merkt sich die Ergebnisse.
type Barcodes struct {
	mu    sync.Mutex
	dir   string
	cache map[string]Product
}

func OpenBarcodes(dir string) *Barcodes {
	b := &Barcodes{dir: dir, cache: map[string]Product{}}
	if raw, err := os.ReadFile(filepath.Join(dir, barcodeFile)); err == nil {
		json.Unmarshal(raw, &b.cache) // beschädigt: dann eben leer, es ist nur ein Zwischenspeicher
	}
	return b
}

func (b *Barcodes) cached(code string, now time.Time) (Product, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	p, ok := b.cache[code]
	if !ok {
		return p, false
	}
	keep := keepNotFound
	if p.Found {
		keep = keepFound
	}
	return p, now.Sub(time.UnixMilli(p.At)) < keep
}

func (b *Barcodes) remember(code string, p Product) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.cache[code] = p
	if data, err := json.Marshal(b.cache); err == nil {
		writeAtomic(filepath.Join(b.dir, barcodeFile), data, 0o600)
	}
}

// Lookup liefert das Ergebnis aus dem Zwischenspeicher oder fragt die Datenbanken der Reihe nach.
// Ist keine Datenbank erreichbar, gibt es einen Fehler und nichts wird gemerkt.
func (b *Barcodes) Lookup(ctx context.Context, cfg Config, code string, now time.Time) (Product, error) {
	if p, ok := b.cached(code, now); ok {
		p.At = 0
		return p, nil
	}
	urls := cfg.BarcodeURLs
	if len(urls) == 0 {
		urls = defaultBarcodeURLs
	}
	reached := false
	for _, base := range urls {
		p, err := fetchProduct(ctx, strings.TrimRight(base, "/"), code)
		if err != nil {
			continue
		}
		reached = true
		if p.Found {
			p.At = now.UnixMilli()
			b.remember(code, p)
			p.At = 0
			return p, nil
		}
	}
	if !reached {
		return Product{}, errors.New("keine Produktdatenbank erreichbar")
	}
	b.remember(code, Product{Found: false, At: now.UnixMilli()})
	return Product{Found: false}, nil
}

// fetchProduct fragt eine Datenbank der Open-Food-Facts-Familie (API v2).
func fetchProduct(ctx context.Context, base, code string) (Product, error) {
	ctx, cancel := context.WithTimeout(ctx, barcodeTimeout)
	defer cancel()
	url := fmt.Sprintf("%s/api/v2/product/%s.json?fields=product_name,product_name_de,brands,categories_tags", base, code)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", barcodeUserAgent)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return Product{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNotFound {
		return Product{}, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	var body struct {
		Status  int `json:"status"`
		Product struct {
			Name       string   `json:"product_name"`
			NameDE     string   `json:"product_name_de"`
			Brands     string   `json:"brands"`
			Categories []string `json:"categories_tags"`
		} `json:"product"`
	}
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err := json.Unmarshal(raw, &body); err != nil {
		return Product{}, err
	}
	if body.Status != 1 {
		return Product{Found: false}, nil
	}
	pr := body.Product
	brand := strings.TrimSpace(strings.Split(pr.Brands, ",")[0])
	name := pr.NameDE
	if strings.TrimSpace(name) == "" {
		name = pr.Name
	}
	variety := cleanVariety(name, brand)
	if brand == "" && variety == "" {
		return Product{Found: false}, nil
	}
	typ, animal := classify(pr.Categories)
	return Product{Found: true, Brand: brand, Variety: variety, Type: typ, Animal: animal}, nil
}

// cleanVariety macht aus „Sheba Fresh Choice Huhn in Sauce 4x50g“ die Sorte „Fresh Choice Huhn in Sauce“.
func cleanVariety(name, brand string) string {
	v := quantityRe.ReplaceAllString(name, " ")
	if brand != "" && strings.HasPrefix(strings.ToLower(strings.TrimSpace(v)), strings.ToLower(brand)) {
		v = strings.TrimSpace(v)[len(brand):]
	}
	return strings.Trim(spacesRe.ReplaceAllString(v, " "), " -–,·|")
}

// classify leitet Art und Tierart nur ab, wenn die Kategorien eindeutig sind.
func classify(tags []string) (typ, animal string) {
	has := func(words ...string) bool {
		for _, t := range tags {
			for _, w := range words {
				if strings.Contains(t, w) {
					return true
				}
			}
		}
		return false
	}
	wet, dry, snack := has("wet"), has("dry"), has("treat", "snack")
	switch {
	case wet && !dry && !snack:
		typ = "Nassfutter"
	case dry && !wet && !snack:
		typ = "Trockenfutter"
	case snack && !wet && !dry:
		typ = "Snack"
	}
	cat, dog := has("cat-"), has("dog-")
	switch {
	case cat && !dog:
		animal = "Katze"
	case dog && !cat:
		animal = "Hund"
	}
	return typ, animal
}
