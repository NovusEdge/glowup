package cli

import (
	"errors"
	"flag"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/novusedge/glowup/installer/internal/claude"
)

func TestParseDefaults(t *testing.T) {
	o, err := Parse(nil, io.Discard)
	if err != nil || !reflect.DeepEqual(o, Options{Choice: claude.Defaults()}) {
		t.Fatalf("got %+v, %v", o, err)
	}
}

func TestParseEveryFlag(t *testing.T) {
	o, err := Parse([]string{"--yes", "--pack", "CRT", "--pet=off", "--bubbles", "off", "--reduced-motion", "--dry-run"}, io.Discard)
	want := Options{Choice: claude.Choice{Pack: "crt", Pet: "off", Bubbles: "off", ReducedMotion: true}, Yes: true, DryRun: true,
		Given: []string{"pack", "pet", "bubbles", "reducedMotion"}}
	if err != nil || !reflect.DeepEqual(o, want) {
		t.Fatalf("got %+v, %v; want %+v", o, err, want)
	}
	if o, _ := Parse([]string{"--version"}, io.Discard); !o.Version {
		t.Fatal("--version not read")
	}
	if o, _ := Parse([]string{"--reduced-motion=false"}, io.Discard); o.Choice.ReducedMotion {
		t.Fatal("--reduced-motion=false read as true")
	}
}

func TestParseThemeAndSpinner(t *testing.T) {
	o, err := Parse([]string{"--yes", "--spinner", "Eyes", "--theme=dusk"}, io.Discard)
	if err != nil || o.Choice.Theme != "dusk" || o.Choice.Spinner != "eyes" || !reflect.DeepEqual(o.Given, []string{"theme", "spinner"}) {
		t.Fatalf("got %+v, %v", o, err)
	}
	if o, err := Parse([]string{"--spinner", "pack", "--theme", "classic"}, io.Discard); err != nil || o.Choice.Spinner != "pack" || o.Choice.Theme != "classic" {
		t.Fatalf("pack and classic are the 'own' values: %+v, %v", o, err)
	}
}

func TestParseRejects(t *testing.T) {
	for _, c := range []struct {
		args []string
		says string
	}{
		{[]string{"--pack", "neon"}, "no pack called \"neon\". Pick one of: classic, crt, cozy, arcade"},
		{[]string{"--pet", "cat"}, "--pet takes clawd or off"},
		{[]string{"--theme", "neon"}, "no theme called \"neon\". Pick one of: classic, glowup"},
		{[]string{"--spinner", "spin"}, "no spinner called \"spin\". Pick one of: stock, comet"},
		{[]string{"--bubbles", "yes"}, "--bubbles takes on, off or haiku"},
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
	if err := CheckTerminal(Options{}, false); err == nil || !strings.Contains(err.Error(), "Run again with --yes to install with the defaults, adding --pack") {
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
