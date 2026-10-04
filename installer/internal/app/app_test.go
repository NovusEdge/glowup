package app

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"slices"
	"strings"
	"testing"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/cli"
)

// fakeRunner answers argv strings from a table and records every call. An argv
// missing from the table behaves like a binary that is not installed.
type fakeRunner struct {
	answers map[string]claude.Result
	calls   []string
}

func (f *fakeRunner) Run(_ context.Context, _ string, argv ...string) (claude.Result, error) {
	key := strings.Join(argv, " ")
	f.calls = append(f.calls, key)
	res, ok := f.answers[key]
	if !ok {
		return claude.Result{}, fmt.Errorf("%s: %w", argv[0], exec.ErrNotFound)
	}
	return res, nil
}

const (
	version    = "claude --version"
	marketList = "claude plugin marketplace list --json"
	pluginList = "claude plugin list --json"
	addMarket  = "claude plugin marketplace add NovusEdge/glowup"
	installCrt = "claude plugin install glowup@glowup --config pack=crt --config pet=clawd --config bubbles=on --config reducedMotion=false --config theme=classic"
	configure  = "claude plugin configure glowup@glowup --values-stdin"
)

func machine(markets, plugins string) map[string]claude.Result {
	return map[string]claude.Result{
		version:    {Stdout: "2.1.289 (Claude Code)\n"},
		marketList: {Stdout: markets},
		pluginList: {Stdout: plugins},
		addMarket:  {Stdout: "Adding marketplace…Cloning via SSH: git@github.com:NovusEdge/glowup.git\nClone complete, validating marketplace…\n✔ Successfully added marketplace: glowup (declared in user settings)\n"},
		installCrt: {Stdout: "Installing plugin \"glowup@glowup\"...✔ Successfully installed plugin: glowup@glowup (scope: user)\n"},
		configure:  {Stdout: "Configuration saved. Restart Claude Code to apply it.\n"},
	}
}

type run struct {
	code     int
	out, err string
	calls    []string
}

func runApp(o cli.Options, answers map[string]claude.Result, pick PickFunc) run {
	r := &fakeRunner{answers: answers}
	var out, errb strings.Builder
	code := Run(context.Background(), o, Deps{Runner: r, Out: &out, Err: &errb, Pick: pick, Step: PlainStep(&out)})
	return run{code, out.String(), errb.String(), r.calls}
}

func crt() cli.Options {
	return cli.Options{Choice: claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}, Yes: true}
}

func TestYesFreshMachine(t *testing.T) {
	got := runApp(crt(), machine(`[]`, `[]`), nil)
	want := []string{version, marketList, pluginList, addMarket, installCrt}
	if got.code != 0 || !slices.Equal(got.calls, want) {
		t.Fatalf("code %d calls %q\n%s%s", got.code, got.calls, got.out, got.err)
	}
	for _, s := range []string{"✓ Adding the glowup marketplace: Successfully added marketplace: glowup (declared in user settings)", "✓ Installing glowup: Successfully installed plugin: glowup@glowup (scope: user)", "type /glowup", DocsURL} {
		if !strings.Contains(got.out, s) {
			t.Errorf("output lacks %q:\n%s", s, got.out)
		}
	}
}

func TestYesMarketplaceAlreadyAdded(t *testing.T) {
	got := runApp(crt(), machine(`[{"name":"glowup"}]`, `[]`), nil)
	if got.code != 0 || slices.Contains(got.calls, addMarket) || !slices.Contains(got.calls, installCrt) {
		t.Fatalf("code %d calls %q", got.code, got.calls)
	}
}

func TestYesAlreadyInstalledNoFlagsLeavesSettings(t *testing.T) {
	got := runApp(crt(), machine(`[{"name":"glowup"}]`, `[{"id":"glowup@glowup"}]`), nil)
	if got.code != 0 || slices.Contains(got.calls, configure) || slices.Contains(got.calls, installCrt) {
		t.Fatalf("code %d calls %q", got.code, got.calls)
	}
	if !strings.Contains(got.out, "already installed") || !strings.Contains(got.out, "--pack") {
		t.Fatalf("output:\n%s", got.out)
	}
}

func TestYesAlreadyInstalledSendsOnlyGivenFlags(t *testing.T) {
	o := crt()
	o.Given = []string{"pack"}
	r := &fakeRunner{answers: machine(`[{"name":"glowup"}]`, `[{"id":"glowup@glowup"}]`)}
	var out, errb strings.Builder
	code := Run(context.Background(), o, Deps{Runner: r, Out: &out, Err: &errb, Step: PlainStep(&out)})
	if code != 0 || r.calls[len(r.calls)-1] != configure || slices.Contains(r.calls, installCrt) {
		t.Fatalf("code %d calls %q", code, r.calls)
	}
}

func TestPickerAlreadyInstalledUpdatesSettings(t *testing.T) {
	pick := func(in claude.Choice, _ bool) (claude.Choice, bool, error) { return in, true, nil }
	got := runApp(cli.Options{Choice: claude.Defaults()}, machine(`[{"name":"glowup"}]`, `[{"id":"glowup@glowup"}]`), pick)
	if got.code != 0 || got.calls[len(got.calls)-1] != configure {
		t.Fatalf("code %d calls %q", got.code, got.calls)
	}
}

func TestPickerChoiceIsInstalled(t *testing.T) {
	o := cli.Options{Choice: claude.Defaults()}
	var sawInstalled bool
	pick := func(in claude.Choice, installed bool) (claude.Choice, bool, error) {
		sawInstalled = installed
		in.Pack = "crt"
		return in, true, nil
	}
	got := runApp(o, machine(`[]`, `[]`), pick)
	if got.code != 0 || sawInstalled || !slices.Contains(got.calls, installCrt) {
		t.Fatalf("code %d calls %q", got.code, got.calls)
	}
}

func TestPickerBackOutRunsNothing(t *testing.T) {
	pick := func(in claude.Choice, _ bool) (claude.Choice, bool, error) { return in, false, nil }
	got := runApp(cli.Options{Choice: claude.Defaults()}, machine(`[]`, `[]`), pick)
	if got.code != 0 || len(got.calls) != 3 || !strings.Contains(got.out, "Nothing changed.") {
		t.Fatalf("code %d calls %q out %q", got.code, got.calls, got.out)
	}
}

func TestPickerError(t *testing.T) {
	pick := func(in claude.Choice, _ bool) (claude.Choice, bool, error) { return in, false, errors.New("no tty") }
	if got := runApp(cli.Options{Choice: claude.Defaults()}, machine(`[]`, `[]`), pick); got.code != 1 {
		t.Fatalf("code %d", got.code)
	}
}

func TestClaudeMissing(t *testing.T) {
	got := runApp(crt(), map[string]claude.Result{}, nil)
	if got.code != 1 || !strings.Contains(got.err, "curl -fsSL https://claude.ai/install.sh | bash") || len(got.calls) != 1 {
		t.Fatalf("code %d calls %q err %q", got.code, got.calls, got.err)
	}
}

func TestClaudeTooOld(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[version] = claude.Result{Stdout: "2.0.5 (Claude Code)\n"}
	got := runApp(crt(), a, nil)
	if got.code != 1 || !strings.Contains(got.err, "needs Claude Code 2.1.289 or later. You have 2.0.5.") || len(got.calls) != 1 {
		t.Fatalf("code %d calls %q err %q", got.code, got.calls, got.err)
	}
}

func TestFailedStepStopsTheRest(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[addMarket] = claude.Result{Code: 1, Stderr: "Failed to clone NovusEdge/glowup: network is unreachable\n"}
	got := runApp(crt(), a, nil)
	if got.code != 1 || slices.Contains(got.calls, installCrt) || !strings.Contains(got.err, "network is unreachable") {
		t.Fatalf("code %d calls %q err %q", got.code, got.calls, got.err)
	}
}

func TestDryRunRunsNothing(t *testing.T) {
	o := crt()
	o.DryRun = true
	got := runApp(o, nil, nil)
	if got.code != 0 || len(got.calls) != 0 {
		t.Fatalf("code %d calls %q", got.code, got.calls)
	}
	if !strings.Contains(got.out, addMarket+"\n"+installCrt+"\n") {
		t.Fatalf("dry run output:\n%s", got.out)
	}
}

func TestDetectFailureInstallsNothing(t *testing.T) {
	a := machine(`[]`, "")
	a[pluginList] = claude.Result{Code: 1, Stderr: "Error: settings.json is not valid JSON\n"}
	got := runApp(crt(), a, nil)
	if got.code != 1 || slices.Contains(got.calls, addMarket) || !strings.Contains(got.err, "settings.json is not valid JSON") {
		t.Fatalf("code %d calls %q err %q", got.code, got.calls, got.err)
	}
}
