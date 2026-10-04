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
	}
	if !slices.Equal(got, want) {
		t.Fatalf("got %q\nwant %q", got, want)
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
					if len(steps) != 1 || !slices.Equal(steps[0].Argv, want) || steps[0].Stdin != "" {
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
	if got := argvs(PlanKeys(c, State{MarketplaceAdded: true}, []string{"pack"})); len(got) != 1 || !strings.Contains(got[0], "theme=classic") {
		t.Fatalf("fresh install ignores keys: %q", got)
	}
}

func TestScript(t *testing.T) {
	got := Script(Plan(Choice{Pack: "crt", Pet: "off", Bubbles: "on"}, State{}))
	want := "claude plugin marketplace add NovusEdge/glowup\n" +
		"claude plugin install glowup@glowup --config pack=crt --config pet=off --config bubbles=on --config reducedMotion=false --config theme=classic\n"
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
