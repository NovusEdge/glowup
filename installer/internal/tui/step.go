package tui

import (
	"context"

	"charm.land/huh/v2/spinner"
)

// Step runs fn behind a spinner titled title and returns fn's result line.
func Step(ctx context.Context, title string, fn func(context.Context) (string, error)) (string, error) {
	var line string
	err := spinner.New().Title(" " + title).Context(ctx).ActionWithErr(func(ctx context.Context) error {
		var err error
		line, err = fn(ctx)
		return err
	}).Run()
	return line, err
}
