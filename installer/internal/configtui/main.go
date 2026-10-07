package configtui

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	tea "charm.land/bubbletea/v2"

	"github.com/novusedge/glowup/installer/internal/tui"
)

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
	if err := Touch(*dir); err != nil {
		fmt.Fprintln(stderr, "glowup-installer config:", err)
		return 1
	}
	p := tea.NewProgram(New(*dir, s), tea.WithColorProfile(tui.ColorProfile(stdout, os.Environ())))
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(stderr, "glowup-installer config:", err)
		return 1
	}
	return 0
}
