package main

// Übersicht für „sudo schmeckts-server uebersicht“: der Datenbestand lesbar statt als JSON.

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ratingNames = map[string]string{"gut": "Gut", "mittel": "Mittel", "sosse": "Nur Soße", "schlecht": "Schlecht"}

func visible(rec *Record) bool { return string(rec.F["_del"].V) != "true" }

func text(rec *Record, field string) string {
	var s string
	json.Unmarshal(rec.F[field].V, &s)
	return strings.TrimSpace(s)
}

func number(rec *Record, field string) float64 {
	var n float64
	json.Unmarshal(rec.F[field].V, &n)
	return n
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func when(t, now time.Time) string {
	day := func(x time.Time) time.Time { y, m, d := x.Date(); return time.Date(y, m, d, 0, 0, 0, 0, x.Location()) }
	switch diff := day(now).Sub(day(t)).Hours() / 24; {
	case diff < 1:
		return "heute " + t.Format("15:04")
	case diff < 2:
		return "gestern " + t.Format("15:04")
	default:
		return t.Format("02.01. 15:04")
	}
}

// Overview fasst den Datenbestand zusammen. dir dient nur für das Datum des letzten Backups.
func Overview(st state, dir string, now time.Time) string {
	var b strings.Builder
	pets, products, servings := st.Records["pets"], st.Records["products"], st.Records["servings"]
	name := func(recs map[string]*Record, id, fallback string) string {
		if r := recs[id]; r != nil {
			if s := strings.TrimSpace(text(r, "brand") + " " + text(r, "variety")); s != "" {
				return s
			}
			if s := text(r, "name"); s != "" {
				return s
			}
		}
		return fallback
	}

	petNames, withCode, productCount, meals := []string{}, []string{}, 0, []*Record{}
	for _, r := range pets {
		if visible(r) {
			petNames = append(petNames, text(r, "name"))
		}
	}
	sort.Strings(petNames)
	for id, r := range products {
		if !visible(r) {
			continue
		}
		productCount++
		codes := []string{}
		for k, f := range r.F {
			if c, ok := strings.CutPrefix(k, "codes."); ok && string(f.V) == "true" {
				codes = append(codes, c)
			}
		}
		if len(codes) > 0 {
			sort.Strings(codes)
			withCode = append(withCode, fmt.Sprintf("  %-30s %s", clip(name(products, id, "?"), 30), strings.Join(codes, ", ")))
		}
	}
	sort.Strings(withCode)
	for _, r := range servings {
		if visible(r) {
			meals = append(meals, r)
		}
	}
	sort.Slice(meals, func(i, j int) bool { return number(meals[i], "servedAt") > number(meals[j], "servedAt") })

	fmt.Fprintf(&b, "Tiere       %3d  %s\n", len(petNames), strings.Join(petNames, ", "))
	fmt.Fprintf(&b, "Futter      %3d  davon %d mit Barcode\n", productCount, len(withCode))
	fmt.Fprintf(&b, "Mahlzeiten  %3d\n", len(meals))

	if len(meals) > 0 {
		b.WriteString("\nLetzte Mahlzeiten\n")
		for i, m := range meals {
			if i == 10 {
				break
			}
			ratings := []string{}
			for k, f := range m.F {
				pid, ok := strings.CutPrefix(k, "pets.")
				if !ok || string(f.V) == "null" {
					continue
				}
				var v struct {
					R *string `json:"r"`
				}
				json.Unmarshal(f.V, &v)
				r := "offen"
				if v.R != nil && ratingNames[*v.R] != "" {
					r = ratingNames[*v.R]
				}
				ratings = append(ratings, name(pets, pid, "?")+": "+r)
			}
			sort.Strings(ratings)
			at := time.UnixMilli(int64(number(m, "servedAt"))).In(now.Location())
			fmt.Fprintf(&b, "  %-15s %-30s %s\n", when(at, now), clip(name(products, text(m, "productId"), "noch ohne Namen"), 30), strings.Join(ratings, ", "))
		}
	}
	if len(withCode) > 0 {
		b.WriteString("\nFutter mit Barcode\n" + strings.Join(withCode, "\n") + "\n")
	}

	// Geräte: letzte Änderung je Geräte-Kennung aus den Feld-Uhren, Name aus „by“, falls bekannt
	type device struct {
		last  int64
		name  string
		named int64
	}
	devices := map[string]*device{}
	for _, recs := range st.Records {
		for _, r := range recs {
			for k, f := range r.F {
				m := clockPattern.FindStringSubmatch(f.T)
				if m == nil {
					continue
				}
				at, _ := strconv.ParseInt(m[1], 10, 64)
				d := devices[m[3]]
				if d == nil {
					d = &device{}
					devices[m[3]] = d
				}
				d.last = max(d.last, at)
				who := ""
				if k == "by" {
					json.Unmarshal(f.V, &who)
				} else if strings.HasPrefix(k, "pets.") {
					var v struct {
						By string `json:"by"`
					}
					json.Unmarshal(f.V, &v)
					who = v.By
				}
				if who = strings.TrimSpace(who); who != "" && at >= d.named {
					d.name, d.named = who, at
				}
			}
		}
	}
	ids := make([]string, 0, len(devices))
	for id := range devices {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return devices[ids[i]].last > devices[ids[j]].last })
	if len(ids) > 0 {
		b.WriteString("\nGeräte, letzte Änderung\n")
		for _, id := range ids {
			label := "Gerät " + id
			if n := devices[id].name; n != "" {
				label = n + " (" + id + ")"
			}
			fmt.Fprintf(&b, "  %-30s %s\n", clip(label, 30), when(time.UnixMilli(devices[id].last).In(now.Location()), now))
		}
	}
	if bk := newestBackup(dir); bk != "" {
		day := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(bk), "state-"), ".json")
		if d, err := time.Parse("2006-01-02", day); err == nil {
			day = d.Format("02.01.2006")
		}
		fmt.Fprintf(&b, "\nLetztes Backup: %s\n", day)
	}
	return b.String()
}
