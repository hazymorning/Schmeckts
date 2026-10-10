package main

// Packaging photo recognition through the Anthropic API. The key never leaves the server; the app asks with the same
// prompt (app/www/js/ai.js) when it has a key of its own.

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	anthropicVersion = "2023-06-01"
	maxImageBytes    = 3 << 20
	recognizeTimeout = 45 * time.Second
)

var (
	anthropicURL = "https://api.anthropic.com" // tests point it elsewhere
	foodTypes    = []string{"Nassfutter", "Trockenfutter", "Snack", "Sonstiges"}
	jsonObject   = regexp.MustCompile(`(?s)\{.*\}`)

	successorMu sync.Mutex
	successors  = map[string]string{} // a retired model → the Sonnet that took over, until the next start
)

type Recognition struct {
	Brand   string `json:"brand"`
	Variety string `json:"variety"`
	Type    string `json:"type"`
}

type recognizeError struct {
	status int
	msg    string
}

func (e *recognizeError) Error() string { return e.msg }

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
	ctx, cancel := context.WithTimeout(ctx, recognizeTimeout)
	defer cancel()
	model := cfg.model()
	successorMu.Lock()
	if next := successors[model]; next != "" {
		model = next
	}
	successorMu.Unlock()
	prompt := buildPrompt(known)
	status, raw, err := askAnthropic(ctx, cfg.APIKey, model, mt, b64, prompt)
	if err == nil && status == http.StatusNotFound {
		// retired: the newest Sonnet the key may use takes over, so the server needs no update for it
		if next, e := newestSonnet(ctx, cfg.APIKey); e == nil && next != model {
			log.Printf("Modell %s gibt es nicht mehr, die Erkennung nimmt jetzt %s", model, next)
			successorMu.Lock()
			successors[cfg.model()] = next
			successorMu.Unlock()
			status, raw, err = askAnthropic(ctx, cfg.APIKey, next, mt, b64, prompt)
		}
	}
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return out, &recognizeError{http.StatusGatewayTimeout, "Die Erkennung hat zu lange gedauert."}
		}
		return out, &recognizeError{http.StatusBadGateway, "Anthropic ist nicht erreichbar."}
	}
	switch {
	case status == 401 || status == 403:
		return out, &recognizeError{http.StatusBadGateway, "Der API-Schlüssel wurde abgelehnt."}
	case status == 429 || status == 529 || status == 503:
		return out, &recognizeError{http.StatusServiceUnavailable, "Anthropic ist gerade ausgelastet, bitte gleich nochmal."}
	case status != 200:
		return out, &recognizeError{http.StatusBadGateway, fmt.Sprintf("Die Erkennung ist fehlgeschlagen (HTTP %d).", status)}
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
		return Recognition{}, nil // nothing recognised, not an error
	}
	out.Brand, out.Variety = strings.TrimSpace(out.Brand), strings.TrimSpace(out.Variety)
	out.Type = oneOf(strings.TrimSpace(out.Type), foodTypes)
	return out, nil
}

// Low effort, as Anthropic advises for extraction: the model mostly answers without thinking first. max_tokens leaves
// room for the thinking it still does.
func askAnthropic(ctx context.Context, key, model, mt, b64, prompt string) (int, []byte, error) {
	body, _ := json.Marshal(map[string]any{
		"model":         model,
		"max_tokens":    4096,
		"output_config": map[string]any{"effort": "low"},
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": mt, "data": b64}},
			map[string]any{"type": "text", "text": prompt},
		}}},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", key)
	req.Header.Set("anthropic-version", anthropicVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, raw, nil
}

// newestSonnet picks from the models the key may use, which Anthropic lists newest first.
func newestSonnet(ctx context.Context, key string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, anthropicURL+"/v1/models?limit=1000", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", key)
	req.Header.Set("anthropic-version", anthropicVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	type support struct{ Supported bool }
	var list struct {
		Data []struct {
			ID           string
			Line         string
			Lifecycle    string
			Capabilities *struct {
				ImageInput support `json:"image_input"`
				Effort     struct{ Low support }
			}
		}
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&list) != nil {
		return "", errors.New("no model list")
	}
	for _, m := range list.Data {
		c := m.Capabilities
		if m.Line == "sonnet" && (m.Lifecycle == "" || m.Lifecycle == "active") &&
			(c == nil || c.ImageInput.Supported && c.Effort.Low.Supported) {
			return m.ID, nil
		}
	}
	return "", errors.New("no Sonnet for this key")
}

// CheckKey asks for the model list, which costs nothing.
func CheckKey(ctx context.Context, cfg Config) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, anthropicURL+"/v1/models", nil)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return errors.New("Anthropic ist nicht erreichbar. Besteht eine Internetverbindung?")
	}
	res.Body.Close()
	switch res.StatusCode {
	case 200:
		return nil
	case 401, 403:
		return errors.New("Anthropic hat den Schlüssel abgelehnt. Bitte auf platform.claude.com prüfen und neu kopieren.")
	default:
		return fmt.Errorf("Anthropic antwortet mit HTTP %d. Bitte später nochmal versuchen.", res.StatusCode)
	}
}
