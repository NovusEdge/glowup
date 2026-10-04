package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/cli"
)

// fakeRunner answers argv strings from a table and records every call. An argv
// missing from the table behaves like a binary that is not installed.
type fakeRunner struct {
	answers map[string]claude.Result
	calls   []string
	stdins  map[string]string // stdin of each call, by argv
}

func (f *fakeRunner) Run(_ context.Context, stdin string, argv ...string) (claude.Result, error) {
	key := strings.Join(argv, " ")
	f.calls = append(f.calls, key)
	if f.stdins == nil {
		f.stdins = map[string]string{}
	}
	f.stdins[key] = stdin
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
		schemaCmd:  {Stdout: newSchema},
	}
}

const (
	schemaCmd = "claude plugin configure glowup@glowup --json"
	newSchema = `{"schema":{"theme":{},"reducedMotion":{},"pack":{},"spinner":{},"pet":{},"bubbles":{}}}`
	oldSchema = `{"schema":{"theme":{},"reducedMotion":{},"pack":{},"pet":{},"bubbles":{}}}`
)

type run struct {
	code     int
	out, err string
	calls    []string
	stdins   map[string]string
}

func runApp(o cli.Options, answers map[string]claude.Result, pick PickFunc) run {
	return runDirs(o, answers, pick, "")
}

func runDirs(o cli.Options, answers map[string]claude.Result, pick PickFunc, dirs string) run {
	r := &fakeRunner{answers: answers}
	var out, errb strings.Builder
	code := Run(context.Background(), o, Deps{Runner: r, Out: &out, Err: &errb, Pick: pick, Step: PlainStep(&out), PluginDirs: dirs})
	return run{code, out.String(), errb.String(), r.calls, r.stdins}
}

func crt() cli.Options {
	return cli.Options{Choice: claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}, Yes: true}
}

func TestYesFreshMachine(t *testing.T) {
	got := runApp(crt(), machine(`[]`, `[]`), nil)
	want := []string{version, marketList, pluginList, addMarket, installCrt, schemaCmd, configure}
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

func TestSaysItIsCheckingClaudeBeforeAskingIt(t *testing.T) {
	got := runApp(crt(), machine(`[]`, `[]`), nil)
	if !strings.HasPrefix(got.out, "Checking Claude Code...\n") {
		t.Fatalf("output starts %q", got.out)
	}
}

// hung is a claude that never answers until it is cancelled.
type hung struct{}

func (hung) Run(ctx context.Context, _ string, _ ...string) (claude.Result, error) {
	<-ctx.Done()
	return claude.Result{}, ctx.Err()
}

func TestClaudeThatNeverAnswersEndsTheCheck(t *testing.T) {
	var out, errb strings.Builder
	done := make(chan int)
	go func() {
		done <- Run(context.Background(), crt(), Deps{Runner: hung{}, Out: &out, Err: &errb, Step: PlainStep(&out), CheckTimeout: 20 * time.Millisecond})
	}()
	select {
	case code := <-done:
		if code != 1 || !strings.Contains(errb.String(), "did not answer within") {
			t.Fatalf("code %d err %q", code, errb.String())
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Run is still waiting on claude")
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

func pickSpinner(in claude.Choice, _ bool) (claude.Choice, bool, error) {
	in.Spinner, in.Pack, in.Pet = "eyes", "crt", "clawd"
	return in, true, nil
}

func installed(schema claude.Result) map[string]claude.Result {
	a := machine(`[{"name":"glowup"}]`, `[{"id":"glowup@glowup"}]`)
	a[schemaCmd] = schema
	return a
}

func TestOldGlowupDoesNotGetTheSpinner(t *testing.T) {
	got := runApp(cli.Options{Choice: claude.Defaults()}, installed(claude.Result{Stdout: oldSchema}), pickSpinner)
	if got.code != 0 || !slices.Contains(got.calls, configure) {
		t.Fatalf("code %d calls %q\n%s%s", got.code, got.calls, got.out, got.err)
	}
	if strings.Contains(got.stdins[configure], "spinner") || !strings.Contains(got.stdins[configure], `"pack":"crt"`) {
		t.Fatalf("stdin %s", got.stdins[configure])
	}
	if !strings.Contains(got.out, "This glowup version can't set the spinner yet. After it updates, run /glowup spinner eyes.") {
		t.Fatalf("output:\n%s", got.out)
	}
}

func TestNewGlowupGetsTheSpinner(t *testing.T) {
	got := runApp(cli.Options{Choice: claude.Defaults()}, installed(claude.Result{Stdout: newSchema}), pickSpinner)
	if got.code != 0 || !strings.Contains(got.stdins[configure], `"spinner":"eyes"`) || strings.Contains(got.out, "can't set") {
		t.Fatalf("code %d stdin %s\n%s", got.code, got.stdins[configure], got.out)
	}
}

func TestUnreadableSchemaSendsBaseKeysOnly(t *testing.T) {
	got := runApp(cli.Options{Choice: claude.Defaults()}, installed(claude.Result{Code: 1, Stderr: "boom\n"}), pickSpinner)
	if got.code != 0 || strings.Contains(got.stdins[configure], "spinner") || !strings.Contains(got.stdins[configure], `"pack":"crt"`) {
		t.Fatalf("code %d stdin %s", got.code, got.stdins[configure])
	}
	for _, s := range []string{"Could not read which settings this glowup has", "can't set the spinner yet"} {
		if !strings.Contains(got.out, s) {
			t.Errorf("output lacks %q:\n%s", s, got.out)
		}
	}
}

func TestFreshInstallSetsTheSpinnerAfterInstalling(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[schemaCmd] = claude.Result{Stdout: newSchema}
	got := runApp(cli.Options{Choice: claude.Defaults()}, a, pickSpinner)
	var i, s, c int = -1, -1, -1
	for n, call := range got.calls {
		switch {
		case strings.HasPrefix(call, "claude plugin install"):
			i = n
		case call == schemaCmd:
			s = n
		case call == configure:
			c = n
		}
	}
	if got.code != 0 || !(i >= 0 && i < s && s < c) || strings.Contains(got.calls[i], "spinner") || got.stdins[configure] != `{"spinner":"eyes"}` {
		t.Fatalf("code %d calls %q stdin %s\n%s%s", got.code, got.calls, got.stdins[configure], got.out, got.err)
	}
}

func TestFreshInstallWithNoSpinnerSetsPack(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[schemaCmd] = claude.Result{Stdout: newSchema}
	got := runApp(crt(), a, nil)
	if got.code != 0 || got.stdins[configure] != `{"spinner":"pack"}` {
		t.Fatalf("code %d stdin %s\n%s%s", got.code, got.stdins[configure], got.out, got.err)
	}
}

func TestOldGlowupDroppingTheDefaultSaysNothing(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[schemaCmd] = claude.Result{Stdout: oldSchema}
	got := runApp(crt(), a, nil)
	if got.code != 0 || slices.Contains(got.calls, configure) || strings.Contains(got.out, "can't set") {
		t.Fatalf("code %d calls %q\n%s%s", got.code, got.calls, got.out, got.err)
	}
	inst := installed(claude.Result{Stdout: oldSchema})
	o := cli.Options{Choice: claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on", Theme: "classic", Spinner: "pack"}, Yes: true, Given: []string{"theme", "spinner"}}
	if got := runApp(o, inst, nil); strings.Contains(got.out, "can't set") {
		t.Fatalf("output:\n%s", got.out)
	}
}

func TestFreshInstallOnOldGlowupSkipsTheSpinnerStep(t *testing.T) {
	a := machine(`[]`, `[]`)
	a[schemaCmd] = claude.Result{Stdout: oldSchema}
	got := runApp(cli.Options{Choice: claude.Defaults()}, a, pickSpinner)
	if got.code != 0 || slices.Contains(got.calls, configure) || !strings.Contains(got.out, "run /glowup spinner eyes.") {
		t.Fatalf("code %d calls %q\n%s%s", got.code, got.calls, got.out, got.err)
	}
}

func TestAnotherInstalledCopyStopsTheInstall(t *testing.T) {
	got := runApp(crt(), machine(`[{"name":"glowup"}]`, `[{"id":"glowup@fork"}]`), nil)
	if got.code != 1 || !strings.Contains(got.err, "glowup@fork") || !strings.Contains(got.err, "claude plugin disable glowup@fork") {
		t.Fatalf("code %d err %q", got.code, got.err)
	}
	for _, c := range got.calls {
		if c == addMarket || c == installCrt || strings.Contains(c, "configure") {
			t.Fatalf("ran %q", c)
		}
	}
}

func devDir(t *testing.T, name string) string {
	d := t.TempDir()
	if err := os.MkdirAll(d+"/.claude-plugin", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(d+"/.claude-plugin/plugin.json", []byte(`{"name":"`+name+`"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestPluginDirsCopyStopsTheInstall(t *testing.T) {
	dev := devDir(t, "glowup")
	got := runDirs(crt(), machine(`[]`, `[]`), nil, devDir(t, "curt")+string(os.PathListSeparator)+dev)
	if got.code != 1 || !strings.Contains(got.err, dev) || !strings.Contains(got.err, "CLAUDE_CODE_PLUGIN_DIRS") {
		t.Fatalf("code %d err %q", got.code, got.err)
	}
	if slices.Contains(got.calls, addMarket) || slices.Contains(got.calls, installCrt) {
		t.Fatalf("ran %q", got.calls)
	}
	if ok := runDirs(crt(), machine(`[]`, `[]`), nil, devDir(t, "curt")); ok.code != 0 {
		t.Fatalf("another plugin's dir blocked the install: %q", ok.err)
	}
}

func TestDryRunWarnsAboutAPluginDirsCopy(t *testing.T) {
	o := crt()
	o.DryRun = true
	dev := devDir(t, "glowup")
	got := runDirs(o, nil, nil, dev)
	if got.code != 1 || len(got.calls) != 0 || !strings.Contains(got.err, dev) || strings.Contains(got.out, installCrt) {
		t.Fatalf("code %d calls %q err %q out %q", got.code, got.calls, got.err, got.out)
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
