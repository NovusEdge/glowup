package cli

import (
	"errors"
	"flag"
	"io"
	"strings"
	"testing"

	"github.com/novusedge/glowup/installer/internal/claude"
)

func TestParseDefaults(t *testing.T) {
	o, err := Parse(nil, io.Discard)
	if err != nil || o != (Options{Choice: claude.Defaults()}) {
		t.Fatalf("got %+v, %v", o, err)
	}
}

func TestParseEveryFlag(t *testing.T) {
	o, err := Parse([]string{"--yes", "--pack", "CRT", "--pet=off", "--bubbles", "off", "--reduced-motion", "--dry-run"}, io.Discard)
	want := Options{Choice: claude.Choice{Pack: "crt", Pet: "off", Bubbles: "off", ReducedMotion: true}, Yes: true, DryRun: true}
	if err != nil || o != want {
		t.Fatalf("got %+v, %v; want %+v", o, err, want)
	}
	if o, _ := Parse([]string{"--version"}, io.Discard); !o.Version {
		t.Fatal("--version not read")
	}
	if o, _ := Parse([]string{"--reduced-motion=false"}, io.Discard); o.Choice.ReducedMotion {
		t.Fatal("--reduced-motion=false read as true")
	}
}

func TestParseRejects(t *testing.T) {
	for _, c := range []struct {
		args []string
		says string
	}{
		{[]string{"--pack", "neon"}, "no pack called \"neon\". Pick one of: classic, crt, cozy, arcade"},
		{[]string{"--pet", "cat"}, "--pet takes clawd or off"},
		{[]string{"--bubbles", "yes"}, "--bubbles takes on or off"},
		{[]string{"install"}, "unexpected argument \"install\""},
		{[]string{"--colour"}, "flag provided but not defined"},
	} {
		var out strings.Builder
		if _, err := Parse(c.args, &out); err == nil || !strings.Contains(out.String(), c.says) {
			t.Errorf("%v: err %v, output %q; want it to say %q", c.args, err, out.String(), c.says)
		}
	}
}

func TestParseHelp(t *testing.T) {
	var out strings.Builder
	if _, err := Parse([]string{"--help"}, &out); !errors.Is(err, flag.ErrHelp) || !strings.Contains(out.String(), "-dry-run") {
		t.Fatalf("err %v, output %q", err, out.String())
	}
}

func TestCheckTerminal(t *testing.T) {
	if err := CheckTerminal(Options{}, false); err == nil || !strings.Contains(err.Error(), "--yes") {
		t.Fatalf("no terminal, no --yes: %v", err)
	}
	for _, o := range []Options{{Yes: true}, {DryRun: true}, {Version: true}} {
		if err := CheckTerminal(o, false); err != nil {
			t.Errorf("%+v: %v", o, err)
		}
	}
	if err := CheckTerminal(Options{}, true); err != nil {
		t.Fatal(err)
	}
}
