package main

// A message for the person at the other end: a German sentence, in the wording the app and the commands use.
//
// Internal errors are lowercase and without punctuation (staticcheck ST1005) and go to the log. Text a person
// reads is a whole sentence, so it uses this type instead of errors.New and fmt.Errorf. That keeps the two
// apart: the German texts of the HTTP interface are at the API boundary (fail() in api.go and recognizeError
// in recognize.go), the texts of the commands are here.

import "fmt"

type message struct {
	text  string
	cause error // optional internal error, appended after a colon
}

func (e *message) Error() string {
	if e.cause == nil {
		return e.text
	}
	return e.text + ": " + e.cause.Error()
}

func (e *message) Unwrap() error { return e.cause }

// say makes a message from a sentence for a person.
func say(text string) error { return &message{text: text} }

// sayf makes a message from a format string and its values.
func sayf(format string, a ...any) error { return &message{text: fmt.Sprintf(format, a...)} }

// because puts a sentence in front of an internal error, the way fmt.Errorf does with %w.
func because(text string, cause error) error { return &message{text: text, cause: cause} }
