// Package app is the installer's flow: check Claude Code, pick a look, run the
// claude commands, say what to do next.
package app

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/cli"
)

const DocsURL = "https://glowup.khimani.dev/"

// StepFunc runs fn under title and returns fn's result line.
type StepFunc func(ctx context.Context, title string, fn func(context.Context) (string, error)) (string, error)

// PickFunc asks the person for a choice, starting from in. ok is false when they
// back out, which installs nothing.
type PickFunc func(in claude.Choice, installed bool) (c claude.Choice, ok bool, err error)

type Deps struct {
	Runner claude.Runner
	Out    io.Writer
	Err    io.Writer
	Pick   PickFunc // nil with --yes
	Step   StepFunc
}

// PlainStep prints the title and runs fn: the --yes path, where there may be no terminal to spin in.
func PlainStep(out io.Writer) StepFunc {
	return func(ctx context.Context, title string, fn func(context.Context) (string, error)) (string, error) {
		fmt.Fprintf(out, "%s...\n", title)
		return fn(ctx)
	}
}

// Run is the whole install. It returns the process exit code.
func Run(ctx context.Context, o cli.Options, d Deps) int {
	if o.DryRun {
		fmt.Fprintln(d.Out, "These commands install glowup on a machine that does not have it yet. Nothing was run.")
		fmt.Fprint(d.Out, claude.Script(claude.Plan(o.Choice, claude.State{})))
		return 0
	}

	if _, err := claude.CheckVersion(ctx, d.Runner); err != nil {
		var tooOld *claude.TooOldError
		switch {
		case errors.Is(err, claude.ErrNotInstalled):
			fmt.Fprintln(d.Err, "Claude Code is not installed. Install it first:")
			fmt.Fprintln(d.Err, "  curl -fsSL https://claude.ai/install.sh | bash")
			fmt.Fprintln(d.Err, "Then run this installer again.")
		case errors.As(err, &tooOld):
			fmt.Fprintf(d.Err, "glowup needs Claude Code %s or later. You have %s.\n", claude.MinVersion, tooOld.Have)
			fmt.Fprintln(d.Err, "Update it with `claude update`, then run this installer again.")
		default:
			fmt.Fprintln(d.Err, "Could not check your Claude Code version:", err)
		}
		return 1
	}

	state, err := claude.Detect(ctx, d.Runner)
	if err != nil {
		fmt.Fprintln(d.Err, "Could not ask Claude Code what it has installed:", err)
		return 1
	}

	choice := o.Choice
	if d.Pick != nil {
		c, ok, err := d.Pick(choice, state.Installed)
		if err != nil {
			fmt.Fprintln(d.Err, "The picker failed:", err)
			return 1
		}
		if !ok {
			fmt.Fprintln(d.Out, "Nothing changed.")
			return 0
		}
		choice = c
	}

	for _, st := range claude.Plan(choice, state) {
		line, err := d.Step(ctx, st.Title, func(ctx context.Context) (string, error) {
			return claude.RunStep(ctx, d.Runner, st)
		})
		if err != nil {
			fmt.Fprintf(d.Err, "✗ %s failed: %v\n", st.Title, err)
			return 1
		}
		fmt.Fprintf(d.Out, "✓ %s: %s\n", st.Title, line)
	}

	fmt.Fprintln(d.Out, "\nDone. Open Claude Code (restart it if it is already running) and type /glowup")
	fmt.Fprintln(d.Out, "Docs:", DocsURL)
	return 0
}
