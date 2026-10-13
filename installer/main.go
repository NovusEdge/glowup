// Command glowup-installer installs the glowup mod into Claude Code.
// install.sh (docs/web/public) downloads and runs it; it is not installed on PATH.
// It also runs glowup's config screen as `glowup-installer config`, which
// /glowup config launches, `spotify-art`, which the Music tab runs for a cover, and
// `spotify-login`, `spotify-refresh` and `spotify-logout`, which connect the music player to a
// Spotify account and keep that login fresh.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"

	"github.com/charmbracelet/x/term"

	"github.com/novusedge/glowup/installer/internal/app"
	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/cli"
	"github.com/novusedge/glowup/installer/internal/configtui"
	"github.com/novusedge/glowup/installer/internal/spotify"
	"github.com/novusedge/glowup/installer/internal/tui"
)

// version is set by the release build: -ldflags "-X main.version=<tag>".
var version = "dev"

func main() { os.Exit(run()) }

func run() int {
	// a subcommand: cli.Parse refuses positional arguments
	subs := map[string]func([]string, io.Writer, io.Writer) int{
		"config":          configtui.Main,
		"spotify-art":     spotify.ArtMain,
		"spotify-login":   spotify.LoginMain,
		"spotify-refresh": spotify.RefreshMain,
		"spotify-logout":  spotify.LogoutMain,
	}
	if len(os.Args) > 1 {
		if sub, ok := subs[os.Args[1]]; ok {
			return sub(os.Args[2:], os.Stdout, os.Stderr)
		}
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
