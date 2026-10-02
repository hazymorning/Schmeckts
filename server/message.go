package main

// Errors a person reads are whole sentences, which errors.New and fmt.Errorf must not carry (staticcheck ST1005).

import "fmt"

type message struct {
	text  string
	cause error
}

func (e *message) Error() string {
	if e.cause == nil {
		return e.text
	}
	return e.text + ": " + e.cause.Error()
}

func (e *message) Unwrap() error { return e.cause }

func say(text string) error { return &message{text: text} }

func sayf(format string, a ...any) error { return &message{text: fmt.Sprintf(format, a...)} }

// because works like fmt.Errorf("text: %w", cause).
func because(text string, cause error) error { return &message{text: text, cause: cause} }
