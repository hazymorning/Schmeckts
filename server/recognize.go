package main

// AI recognition of a food packaging through the Anthropic API. Key, model and prompt live
// here on the server alone; the app only sends the photo.

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	anthropicVersion = "2023-06-01"
	maxImageBytes    = 3 << 20
	recognizeTimeout = 45 * time.Second
)

var (
	foodTypes   = []string{"Nassfutter", "Trockenfutter", "Snack", "Sonstiges"}
	animalKinds = []string{"Katze", "Hund", "Kaninchen", "Vogel", "Nager", "Andere"}
	jsonObject  = regexp.MustCompile(`(?s)\{.*\}`)
)

type Recognition struct {
	Brand   string `json:"brand"`
	Variety string `json:"variety"`
	Type    string `json:"type"`
	Animal  string `json:"animal"`
}

// recognizeError carries a message for the app and the matching HTTP status.
type recognizeError struct {
	status int
	msg    string
}

func (e *recognizeError) Error() string { return e.msg }

// promptText lives in recognize-prompt.txt, next to this file, because //go:embed cannot reach outside the package,
// so that server and app use the same text (test: tests/design_test.py).
//
//go:embed recognize-prompt.txt
var promptText string

func buildPrompt(known []string) string {
	p := strings.TrimSpace(promptText)
	if len(known) > 0 {
		p += "\nProducts already known. If it is one of these, use exactly this spelling:\n" + strings.Join(known, "\n")
	}
	return p
}

func mediaType(img []byte) string {
	switch {
	case bytes.HasPrefix(img, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg"
	case bytes.HasPrefix(img, []byte("\x89PNG")):
		return "image/png"
	case len(img) > 12 && string(img[:4]) == "RIFF" && string(img[8:12]) == "WEBP":
		return "image/webp"
	}
	return ""
}

func oneOf(v string, allowed []string) string {
	for _, a := range allowed {
		if strings.EqualFold(v, a) {
			return a
		}
	}
	return ""
}

// Recognize sends the photo to Claude and returns brand, variety, type and species.
func Recognize(ctx context.Context, cfg Config, b64 string, known []string) (Recognition, error) {
	var out Recognition
	img, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(img) == 0 || len(img) > maxImageBytes {
		return out, &recognizeError{http.StatusBadRequest, "Das Foto ist ungültig oder zu groß."}
	}
	mt := mediaType(img)
	if mt == "" {
		return out, &recognizeError{http.StatusBadRequest, "Das Foto hat kein bekanntes Format."}
	}
	body, _ := json.Marshal(map[string]any{
		"model":      cfg.model(),
		"max_tokens": 400,
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": mt, "data": b64}},
			map[string]any{"type": "text", "text": buildPrompt(known)},
		}}},
	})
	ctx, cancel := context.WithTimeout(ctx, recognizeTimeout)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, cfg.anthropicURL()+"/v1/messages", bytes.NewReader(body))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return out, &recognizeError{http.StatusGatewayTimeout, "Die Erkennung hat zu lange gedauert."}
		}
		return out, &recognizeError{http.StatusBadGateway, "Anthropic ist nicht erreichbar."}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	switch {
	case res.StatusCode == 401 || res.StatusCode == 403:
		return out, &recognizeError{http.StatusBadGateway, "Der API-Schlüssel wurde abgelehnt."}
	case res.StatusCode == 429 || res.StatusCode == 529 || res.StatusCode == 503:
		return out, &recognizeError{http.StatusServiceUnavailable, "Anthropic ist gerade ausgelastet, bitte gleich nochmal."}
	case res.StatusCode != 200:
		return out, &recognizeError{http.StatusBadGateway, fmt.Sprintf("Die Erkennung ist fehlgeschlagen (HTTP %d).", res.StatusCode)}
	}
	var msg struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return out, &recognizeError{http.StatusBadGateway, "Unerwartete Antwort von Anthropic."}
	}
	var text strings.Builder
	for _, c := range msg.Content {
		if c.Type == "text" {
			text.WriteString(c.Text)
		}
	}
	m := jsonObject.FindString(strings.NewReplacer("```json", "", "```", "").Replace(text.String()))
	if m == "" || json.Unmarshal([]byte(m), &out) != nil {
		return Recognition{}, nil // nothing recognised: the app then asks for the name
	}
	out.Brand, out.Variety = strings.TrimSpace(out.Brand), strings.TrimSpace(out.Variety)
	out.Type, out.Animal = oneOf(strings.TrimSpace(out.Type), foodTypes), oneOf(strings.TrimSpace(out.Animal), animalKinds)
	return out, nil
}

// CheckKey validates an API key using the free model list.
func CheckKey(ctx context.Context, cfg Config) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, cfg.anthropicURL()+"/v1/models", nil)
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("Anthropic ist nicht erreichbar. Besteht eine Internetverbindung?")
	}
	res.Body.Close()
	switch res.StatusCode {
	case 200:
		return nil
	case 401, 403:
		return fmt.Errorf("Anthropic hat den Schlüssel abgelehnt. Bitte auf platform.claude.com prüfen und neu kopieren.")
	default:
		return fmt.Errorf("Anthropic antwortet mit HTTP %d. Bitte später nochmal versuchen.", res.StatusCode)
	}
}
