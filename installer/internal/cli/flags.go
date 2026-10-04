// Package cli reads the installer's command line.
package cli

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

// Options is the parsed command line. Choice starts at claude.Defaults() and
// takes any --pack, --pet, --bubbles and --reduced-motion values; the picker
// starts from it, and --yes installs it as is.
type Options struct {
	Choice  claude.Choice
	Yes     bool
	DryRun  bool
	Version bool
}

// Parse reads args (without the program name). It returns flag.ErrHelp for
// -h/--help, and an error for anything it cannot use, after printing why to out.
func Parse(args []string, out io.Writer) (Options, error) {
	o := Options{Choice: claude.Defaults()}
	fs := flag.NewFlagSet("glowup-installer", flag.ContinueOnError)
	fs.SetOutput(out)
	fs.Usage = func() {
		fmt.Fprintln(out, "usage: glowup-installer [--yes] [--pack NAME] [--pet clawd|off] [--bubbles on|off] [--reduced-motion] [--dry-run] [--version]")
		fmt.Fprintln(out, "\nInstalls the glowup mod into Claude Code. With no flags it asks you to pick a look first.")
		fs.PrintDefaults()
	}
	fs.BoolVar(&o.Yes, "yes", false, "install without asking: the defaults, or the values of the flags below")
	fs.StringVar(&o.Choice.Pack, "pack", o.Choice.Pack, "pack: "+strings.Join(packs.Names(), ", "))
	fs.StringVar(&o.Choice.Pet, "pet", o.Choice.Pet, "pet: clawd or off")
	fs.StringVar(&o.Choice.Bubbles, "bubbles", o.Choice.Bubbles, "speech bubbles: on or off")
	fs.BoolVar(&o.Choice.ReducedMotion, "reduced-motion", o.Choice.ReducedMotion, "turn off glowup's animation")
	fs.BoolVar(&o.DryRun, "dry-run", false, "print the commands a fresh install runs, and run nothing (not even the checks)")
	fs.BoolVar(&o.Version, "version", false, "print the installer's version")
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	if fs.NArg() > 0 {
		return o, usageErr(out, "unexpected argument %q", fs.Arg(0))
	}
	o.Choice.Pack = strings.ToLower(o.Choice.Pack)
	o.Choice.Pet = strings.ToLower(o.Choice.Pet)
	o.Choice.Bubbles = strings.ToLower(o.Choice.Bubbles)
	if !slices.Contains(packs.Names(), o.Choice.Pack) {
		return o, usageErr(out, "there is no pack called %q. Pick one of: %s", o.Choice.Pack, strings.Join(packs.Names(), ", "))
	}
	if o.Choice.Pet != "clawd" && o.Choice.Pet != "off" {
		return o, usageErr(out, "--pet takes clawd or off, not %q", o.Choice.Pet)
	}
	if o.Choice.Bubbles != "on" && o.Choice.Bubbles != "off" {
		return o, usageErr(out, "--bubbles takes on or off, not %q", o.Choice.Bubbles)
	}
	return o, nil
}

func usageErr(out io.Writer, format string, a ...any) error {
	err := fmt.Errorf(format, a...)
	fmt.Fprintln(out, err)
	return err
}

// CheckTerminal refuses to start the picker without a terminal to draw it on.
// install.sh passes --yes itself when there is none; this catches the binary run
// by hand from a pipe or a CI step.
func CheckTerminal(o Options, interactive bool) error {
	if o.Yes || o.DryRun || o.Version || interactive {
		return nil
	}
	return errors.New("there is no terminal to show the picker in. Run again with --yes to install with the defaults, or add --pack, --pet, --bubbles or --reduced-motion to choose")
}
