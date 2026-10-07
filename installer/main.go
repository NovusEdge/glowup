// Command glowup-installer installs the glowup mod into Claude Code.
// install.sh (docs/web/public) downloads and runs it; it is not installed on PATH.
// It also runs glowup's config screen as `glowup-installer config`, which
// /glowup config launches.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"

	"github.com/charmbracelet/x/term"

	"github.com/novusedge/glowup/installer/internal/app"
	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/cli"
	"github.com/novusedge/glowup/installer/internal/configtui"
	"github.com/novusedge/glowup/installer/internal/tui"
)

// version is set by the release build: -ldflags "-X main.version=<tag>".
var version = "dev"

func main() { os.Exit(run()) }

func run() int {
	// a subcommand: cli.Parse refuses positional arguments
	if len(os.Args) > 1 && os.Args[1] == "config" {
		return configtui.Main(os.Args[2:], os.Stdout, os.Stderr)
	}
	o, err := cli.Parse(os.Args[1:], os.Stderr)
	if errors.Is(err, flag.ErrHelp) {
		return 0
	}
	if err != nil {
		return 2
	}
	if o.Version {
		fmt.Println("glowup-installer", version)
		return 0
	}
	if err := cli.CheckTerminal(o, term.IsTerminal(os.Stdin.Fd()) && term.IsTerminal(os.Stdout.Fd())); err != nil {
		fmt.Fprintln(os.Stderr, "glowup-installer:", err)
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	d := app.Deps{Runner: claude.ExecRunner{}, Out: os.Stdout, Err: os.Stderr, Step: app.PlainStep(os.Stdout), PluginDirs: os.Getenv("CLAUDE_CODE_PLUGIN_DIRS")}
	if !o.Yes {
		d.Pick, d.Step = tui.Pick, tui.Step
	}
	return app.Run(ctx, o, d)
}
