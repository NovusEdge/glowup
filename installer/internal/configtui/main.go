package configtui

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/novusedge/glowup/installer/internal/tui"
)

// openFresh is how old open's mtime may be before the mod treats the run as abandoned.
const openFresh = 10 * time.Second

// programOptions lets a test give the program input and output in place of a terminal.
var programOptions []tea.ProgramOption

// Main runs `glowup-installer config --run DIR`. Closing the window (SIGHUP) ends the
// process with the changes kept: they already show in the session.
func Main(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("glowup-installer config", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dir := fs.String("run", "", "the run directory /glowup config created")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if *dir == "" {
		fmt.Fprintln(stderr, "glowup-installer config: --run is required; /glowup config in Claude Code passes it")
		return 2
	}
	s, ok := ReadState(*dir)
	if !ok {
		fmt.Fprintf(stderr, "glowup-installer config: no glowup config run at %s. Run /glowup config in Claude Code.\n", *dir)
		return 1
	}
	// two TUIs on one run would interleave their seq numbers and misjudge each other's answers
	if fi, err := os.Stat(filepath.Join(*dir, "open")); err == nil && time.Since(fi.ModTime()) < openFresh {
		fmt.Fprintln(stderr, "glowup config is already open.")
		return 1
	}
	if err := Touch(*dir); err != nil {
		fmt.Fprintln(stderr, "glowup-installer config:", err)
		return 1
	}
	// The mod stops polling once open has been seen and then goes missing. A window closed by
	// SIGHUP skips this and is judged by open's age instead.
	defer os.Remove(filepath.Join(*dir, "open"))
	profile := tui.ColorProfile(stdout, os.Environ())
	m := New(*dir, s)
	m.profile = profile
	p := tea.NewProgram(m, append([]tea.ProgramOption{tea.WithColorProfile(profile)}, programOptions...)...)
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(stderr, "glowup-installer config:", err)
		return 1
	}
	return 0
}
