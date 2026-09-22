package main

// The overview for "sudo schmeckts-server overview": the stored data readably instead of as JSON.
// The output is German, like the app.

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Every level of every scale, with the wording the app uses (RATINGS in app/www/js/config.js). The key alone
// decides the wording, so the two lists must not drift apart: tests/design_test.py compares them.
var ratingNames = map[string]string{
	"top": "Sofort leer", "gut": "Später leer", "mittel": "Halb gegessen", "sosse": "Soße geleckt", "schlecht": "Kaum angerührt",
	"gern": "Gern gefressen", "normal": "Normal gefressen", "wenig": "Wenig gefressen", "liegen": "Liegen gelassen",
	"verputzt": "Sofort verputzt", "spaeter": "Später gefressen", "angeknabbert": "Nur angeknabbert", "unberuehrt": "Nicht angerührt",
}

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

// Overview summarises the stored data. dir is only used for the date of the last backup.
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

	// Devices: the latest change per device id from the field clocks, with the name from "by" where known
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
