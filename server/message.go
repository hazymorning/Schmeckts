package main

// A message for the person at the other end: a German sentence, the way the app and the commands speak.
//
// Internal errors are lowercase and without punctuation, as Go wants them (staticcheck ST1005), and they are for
// the log. What a person reads is prose, so it does not go through errors.New and fmt.Errorf but through this type.
// That keeps the two apart: the German texts of the HTTP interface live at the API boundary (fail() in api.go and
// recognizeError in recognize.go), and the texts of the commands live here.

import "fmt"

type message struct {
	text  string
	cause error // an internal error worth naming, appended after a colon
}

func (e *message) Error() string {
	if e.cause == nil {
		return e.text
	}
	return e.text + ": " + e.cause.Error()
}

func (e *message) Unwrap() error { return e.cause }

// say is a sentence for a person.
func say(text string) error { return &message{text: text} }

// sayf is a sentence with values in it.
func sayf(format string, a ...any) error { return &message{text: fmt.Sprintf(format, a...)} }

// because puts a sentence in front of an internal error, the way fmt.Errorf does with %w.
func because(text string, cause error) error { return &message{text: text, cause: cause} }
