package claude

import (
	"context"
	"slices"
	"strings"
	"testing"
)

func argvs(steps []Step) []string {
	out := make([]string, len(steps))
	for i, s := range steps {
		out[i] = strings.Join(s.Argv, " ")
	}
	return out
}

func TestPlanFreshInstall(t *testing.T) {
	got := argvs(Plan(Defaults(), State{}))
	want := []string{
		"claude plugin marketplace add NovusEdge/glowup",
		"claude plugin install glowup@glowup --config pack=classic --config pet=clawd --config bubbles=on --config reducedMotion=false --config theme=classic",
		"claude plugin configure glowup@glowup --values-stdin",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("got %q\nwant %q", got, want)
	}
	// an unset spinner makes the install report "1 userConfig option not yet set"
	if st := Plan(Defaults(), State{})[2]; st.Stdin != `{"spinner":"pack"}` || !st.Configure {
		t.Fatalf("got %+v", st)
	}
}

func TestPlanEveryChoiceCombination(t *testing.T) {
	for _, pack := range []string{"classic", "crt", "cozy", "arcade"} {
		for _, pet := range []string{"clawd", "off"} {
			for _, bubbles := range []string{"on", "off"} {
				for _, rm := range []bool{false, true} {
					c := Choice{Pack: pack, Pet: pet, Bubbles: bubbles, ReducedMotion: rm}
					steps := Plan(c, State{MarketplaceAdded: true})
					rmText := "false"
					if rm {
						rmText = "true"
					}
					want := []string{"claude", "plugin", "install", "glowup@glowup",
						"--config", "pack=" + pack, "--config", "pet=" + pet,
						"--config", "bubbles=" + bubbles, "--config", "reducedMotion=" + rmText,
						"--config", "theme=classic"}
					if len(steps) != 2 || !slices.Equal(steps[0].Argv, want) || steps[0].Stdin != "" || steps[1].Stdin != `{"spinner":"pack"}` {
						t.Fatalf("%+v: got %+v", c, steps)
					}
				}
			}
		}
	}
}

func TestPlanInstalledUpdatesSettingsOnly(t *testing.T) {
	c := Choice{Pack: "arcade", Pet: "off", Bubbles: "off", ReducedMotion: true}
	steps := Plan(c, State{MarketplaceAdded: true, Installed: true})
	if len(steps) != 1 {
		t.Fatalf("got %d steps", len(steps))
	}
	if got := strings.Join(steps[0].Argv, " "); got != "claude plugin configure glowup@glowup --values-stdin" {
		t.Fatalf("argv = %q", got)
	}
	if want := `{"bubbles":"off","pack":"arcade","pet":"off","reducedMotion":"true"}`; steps[0].Stdin != want {
		t.Fatalf("stdin = %s, want %s", steps[0].Stdin, want)
	}
}

func TestPlanKeysSendsOnlyTheNamedKeys(t *testing.T) {
	c := Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}
	steps := PlanKeys(c, State{MarketplaceAdded: true, Installed: true}, []string{"pack"})
	if len(steps) != 1 || steps[0].Stdin != `{"pack":"crt"}` {
		t.Fatalf("got %+v", steps)
	}
	if got := argvs(PlanKeys(c, State{MarketplaceAdded: true}, []string{"pack"})); len(got) != 2 || !strings.Contains(got[0], "theme=classic") {
		t.Fatalf("fresh install ignores keys: %q", got)
	}
}

func TestPlanThemeAndSpinner(t *testing.T) {
	c := Choice{Pack: "crt", Pet: "clawd", Bubbles: "on", Theme: "dusk", Spinner: "eyes"}
	// the spinner is not an install option: older glowups lack it, so it follows as a configure step
	want := []string{
		"claude plugin install glowup@glowup --config pack=crt --config pet=clawd --config bubbles=on --config reducedMotion=false --config theme=dusk",
		"claude plugin configure glowup@glowup --values-stdin",
	}
	fresh := Plan(c, State{MarketplaceAdded: true})
	if !slices.Equal(argvs(fresh), want) || fresh[1].Stdin != `{"spinner":"eyes"}` || !fresh[1].Configure || fresh[0].Configure {
		t.Fatalf("got %+v", fresh)
	}
	installed := State{MarketplaceAdded: true, Installed: true}
	if got := Plan(c, installed)[0].Stdin; got != `{"bubbles":"on","pack":"crt","pet":"clawd","reducedMotion":"false","spinner":"eyes","theme":"dusk"}` {
		t.Fatalf("picked theme and spinner are sent: %s", got)
	}
	if got := Plan(Choice{Pack: "crt", Pet: "off", Bubbles: "on", Theme: "dusk"}, installed)[0].Stdin; strings.Contains(got, "spinner") || !strings.Contains(got, `"theme":"dusk"`) {
		t.Fatalf("only the picked one is sent: %s", got)
	}
	if got := PlanKeys(c, installed, []string{"spinner"})[0].Stdin; got != `{"spinner":"eyes"}` {
		t.Fatalf("--yes sends only the flags given: %s", got)
	}
	if got := PlanKeys(Choice{Pack: "crt", Theme: "dusk"}, installed, []string{"pack"})[0].Stdin; got != `{"pack":"crt"}` {
		t.Fatalf("a theme not given as a flag is not sent: %s", got)
	}
}

func TestDeclared(t *testing.T) {
	const cmd = "claude plugin configure glowup@glowup --json"
	old := `{"pluginId":"glowup@glowup","schema":{"theme":{"type":"string"},"reducedMotion":{"type":"boolean"},"pack":{},"pet":{},"bubbles":{}},"inputs":{}}`
	got, err := Declared(context.Background(), &fakeRunner{answers: map[string]Result{cmd: {Stdout: old}}})
	if err != nil || !slices.Equal(got, []string{"bubbles", "pack", "pet", "reducedMotion", "theme"}) {
		t.Fatalf("got %q, %v", got, err)
	}
	for name, res := range map[string]Result{
		"exit":  {Code: 1, Stderr: "boom\n"},
		"text":  {Stdout: "nope\n"},
		"empty": {Stdout: `{"schema":{}}`},
	} {
		if _, err := Declared(context.Background(), &fakeRunner{answers: map[string]Result{cmd: res}}); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

func TestRestrict(t *testing.T) {
	st := Step{Argv: []string{"x"}, Stdin: `{"bubbles":"on","spinner":"eyes","theme":"dusk"}`, Configure: true}
	got, dropped := Restrict(st, BaseKeys)
	if got.Stdin != `{"bubbles":"on","theme":"dusk"}` || len(dropped) != 1 || dropped[0] != (Dropped{"spinner", "eyes"}) {
		t.Fatalf("got %s %+v", got.Stdin, dropped)
	}
	if got, dropped := Restrict(st, append([]string{"spinner"}, BaseKeys...)); got.Stdin != st.Stdin || len(dropped) != 0 {
		t.Fatalf("a declared key is kept: %s %+v", got.Stdin, dropped)
	}
}

func TestScript(t *testing.T) {
	got := Script(Plan(Choice{Pack: "crt", Pet: "off", Bubbles: "on"}, State{}))
	want := "claude plugin marketplace add NovusEdge/glowup\n" +
		"claude plugin install glowup@glowup --config pack=crt --config pet=off --config bubbles=on --config reducedMotion=false --config theme=classic\n" +
		`printf '%s\n' '{"spinner":"pack"}' | claude plugin configure glowup@glowup --values-stdin` + "\n"
	if got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
	got = Script(Plan(Defaults(), State{MarketplaceAdded: true, Installed: true}))
	want = `printf '%s\n' '{"bubbles":"on","pack":"classic","pet":"clawd","reducedMotion":"false"}' | claude plugin configure glowup@glowup --values-stdin` + "\n"
	if got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
}

func TestRunStep(t *testing.T) {
	ctx := context.Background()
	st := Plan(Defaults(), State{MarketplaceAdded: true, Installed: true})[0]
	r := &fakeRunner{answers: map[string]Result{strings.Join(st.Argv, " "): {Stdout: "Configuration saved. Restart Claude Code to apply it.\n"}}}
	line, err := RunStep(ctx, r, st)
	if err != nil || line != "Configuration saved. Restart Claude Code to apply it." {
		t.Fatalf("line %q err %v", line, err)
	}
	if r.stdins[0] != st.Stdin {
		t.Fatalf("stdin not passed: %q", r.stdins[0])
	}

	fail := &fakeRunner{answers: map[string]Result{strings.Join(st.Argv, " "): {Code: 1, Stderr: "warn\nValue for pack is not allowed\n"}}}
	if _, err := RunStep(ctx, fail, st); err == nil || !strings.Contains(err.Error(), "Value for pack is not allowed") {
		t.Fatalf("err = %v", err)
	}

	// Real 2.1.289 output: progress text, then the verdict after a check mark, on one line.
	inst := Plan(Defaults(), State{MarketplaceAdded: true})[0]
	key := strings.Join(inst.Argv, " ")
	ok := &fakeRunner{answers: map[string]Result{key: {Stdout: "Installing plugin \"glowup@glowup\"...✔ Successfully installed plugin: glowup@glowup (scope: user)\n"}}}
	if line, err := RunStep(ctx, ok, inst); err != nil || line != "Successfully installed plugin: glowup@glowup (scope: user)" {
		t.Fatalf("install: %q %v", line, err)
	}
	// Real 2.1.289 output when a --config value fails the schema: exit 0 and a ⚠ line.
	warn := &fakeRunner{answers: map[string]Result{key: {Stdout: "Installing plugin \"glowup@glowup\"...✔ Plugin \"glowup@glowup\" is already installed (scope: user)\n⚠ Installed, but --config not applied: --config reducedMotion: \"maybe\" is not a boolean (use true/false, 1/0, yes/no, on/off)\n"}}}
	if _, err := RunStep(ctx, warn, inst); err == nil || !strings.Contains(err.Error(), "--config not applied") {
		t.Fatalf("warning passed as success: %v", err)
	}

	advice := &fakeRunner{answers: map[string]Result{key: {Stdout: "⚠ Marketplace cache is old\n✔ Successfully installed plugin: glowup@glowup (scope: user)\n"}}}
	if _, err := RunStep(ctx, advice, inst); err != nil {
		t.Fatalf("advice line failed the step: %v", err)
	}

	quiet := &fakeRunner{answers: map[string]Result{strings.Join(st.Argv, " "): {}}}
	if line, err := RunStep(ctx, quiet, st); err != nil || line != "done" {
		t.Fatalf("quiet: %q %v", line, err)
	}
}
