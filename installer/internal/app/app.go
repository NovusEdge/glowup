// Package app is the installer's flow: check Claude Code, pick a look, run the
// claude commands, say what to do next.
package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

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
	// PluginDirs is $CLAUDE_CODE_PLUGIN_DIRS, a path list of plugins Claude Code loads in place.
	PluginDirs string
}

// refuseSecondCopy says what already loads glowup and how to turn it off. An empty
// string means there is nothing in the way.
func refuseSecondCopy(others, dirs []string) string {
	if len(others) == 0 && len(dirs) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("glowup is already loaded from another source. Installing it here would run two copies at once, which draws twice and can loop the status line.\n")
	for _, id := range others {
		fmt.Fprintf(&b, "  %s is installed. Run: claude plugin disable %s (or: claude plugin uninstall %s)\n", id, id, id)
	}
	for _, d := range dirs {
		fmt.Fprintf(&b, "  %s is loaded through CLAUDE_CODE_PLUGIN_DIRS. Remove it from that variable and start Claude Code again.\n", d)
	}
	b.WriteString("Nothing was installed. Run this installer again once only one copy is left.\n")
	return b.String()
}

// dropNote is the line for a pick the installed glowup is too old to take.
func dropNote(d claude.Dropped) string {
	cmd := map[string]string{"spinner": "spinner", "theme": "theme", "pack": "pack", "pet": "pet", "bubbles": "bubbles", "reducedMotion": "motion"}[d.Key]
	if cmd == "" {
		return fmt.Sprintf("This glowup version can't set %s yet. After it updates, run /glowup config.", d.Key)
	}
	return fmt.Sprintf("This glowup version can't set the %s yet. After it updates, run /glowup %s %s.", d.Key, cmd, d.Value)
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
	dirs := claude.PluginDirCopies(d.PluginDirs)
	if o.DryRun {
		// a dry run starts no process, so only the environment is checked here
		if msg := refuseSecondCopy(nil, dirs); msg != "" {
			fmt.Fprint(d.Err, msg)
			return 1
		}
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

	if msg := refuseSecondCopy(state.Other, dirs); msg != "" {
		fmt.Fprint(d.Err, msg)
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

	// Without the picker nobody was asked about an installed glowup, so only what
	// they typed as flags changes.
	var keys []string
	if state.Installed && d.Pick == nil {
		if len(o.Given) == 0 {
			fmt.Fprintln(d.Out, "glowup is already installed, and its settings were left as they are. To change them, run again with --yes and --pack, --theme, --spinner, --pet, --bubbles or --reduced-motion.")
			return 0
		}
		keys = o.Given
	}

	// Declared options are read once, and only if a configure step needs them.
	var declared []string
	var declaredErr error
	read := false
	for _, st := range claude.PlanKeys(choice, state, keys) {
		if st.Configure {
			if !read {
				read = true
				declared, declaredErr = claude.Declared(ctx, d.Runner)
				if declaredErr != nil {
					declared = claude.BaseKeys
					fmt.Fprintf(d.Out, "Could not read which settings this glowup has (%v), so only %s are sent.\n", declaredErr, strings.Join(claude.BaseKeys, ", "))
				}
			}
			var dropped []claude.Dropped
			st, dropped = claude.Restrict(st, declared)
			for _, dr := range dropped {
				fmt.Fprintln(d.Out, dropNote(dr))
			}
			if st.Stdin == "{}" {
				continue
			}
		}
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
