package claude

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// Step is one claude command the installer runs.
type Step struct {
	Title string // shown beside the spinner, plain English
	Argv  []string
	Stdin string // empty: the command gets no input
}

// Plan returns the commands that take Claude Code from s to glowup installed with c.
// A marketplace that is already added is skipped. An installed glowup gets its
// settings updated through `plugin configure --values-stdin` instead of a reinstall.
func Plan(c Choice, s State) []Step { return PlanKeys(c, s, nil) }

// PlanKeys is Plan, except an installed glowup gets only the named userConfig keys
// (all of pack, pet, bubbles and reducedMotion when keys is nil, plus theme and
// spinner when the choice has them). A fresh install always sends every value.
func PlanKeys(c Choice, s State, keys []string) []Step {
	var steps []Step
	if !s.MarketplaceAdded {
		steps = append(steps, Step{
			Title: "Adding the glowup marketplace",
			Argv:  []string{"claude", "plugin", "marketplace", "add", MarketplaceSource},
		})
	}
	if s.Installed {
		return append(steps, Step{
			Title: "Updating glowup's settings",
			Argv:  []string{"claude", "plugin", "configure", PluginID, "--values-stdin"},
			Stdin: valuesJSON(c, keys),
		})
	}
	argv := []string{"claude", "plugin", "install", PluginID}
	for _, kv := range values(c) {
		argv = append(argv, "--config", kv[0]+"="+kv[1])
	}
	return append(steps, Step{Title: "Installing glowup", Argv: argv})
}

// values is the userConfig pairs in the order the install argv lists them.
// theme=classic is the mod's "no theme override" value (hooks/register.tsx ignores a
// classic theme and uses the pack's palette), and spinner=pack is its "no spinner
// override" value, so the pack picked here is the look the person gets. Leaving
// either unset makes `claude plugin install` report an unset option.
func values(c Choice) [][2]string {
	return [][2]string{
		{"pack", c.Pack},
		{"pet", c.Pet},
		{"bubbles", c.Bubbles},
		{"reducedMotion", strconv.FormatBool(c.ReducedMotion)},
		{"theme", cmp.Or(c.Theme, "classic")},
		{"spinner", cmp.Or(c.Spinner, "pack")},
	}
}

// valuesJSON is the stdin for `plugin configure --values-stdin`, which takes a JSON
// object of single-line strings, so the boolean goes as "true" or "false". It keeps
// keys left out of the object, so theme and spinner go only when the person picked
// them: otherwise the theme and spinner already set survive.
func valuesJSON(c Choice, keys []string) string {
	picked := map[string]bool{"theme": c.Theme != "", "spinner": c.Spinner != ""}
	m := map[string]string{}
	for _, kv := range values(c) {
		if has, optional := picked[kv[0]]; optional && !has {
			continue
		}
		if keys == nil || slices.Contains(keys, kv[0]) {
			m[kv[0]] = kv[1]
		}
	}
	b, _ := json.Marshal(m) // map keys marshal sorted, so the output is stable
	return string(b)
}

// Script renders steps as shell lines for --dry-run.
func Script(steps []Step) string {
	var b strings.Builder
	for _, st := range steps {
		quoted := make([]string, len(st.Argv))
		for i, a := range st.Argv {
			quoted[i] = shellQuote(a)
		}
		line := strings.Join(quoted, " ")
		if st.Stdin != "" {
			line = "printf '%s\\n' " + shellQuote(st.Stdin) + " | " + line
		}
		b.WriteString(line + "\n")
	}
	return b.String()
}

var shellSafe = regexp.MustCompile(`^[A-Za-z0-9@%+=:,./_-]+$`)

func shellQuote(s string) string {
	if shellSafe.MatchString(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// RunStep runs st and returns the line to show under its title: the last line the
// command printed, from its last "✔ " on (claude prints progress text before the
// check mark on the same line). A non-zero exit is an error carrying the command's
// last stderr line.
func RunStep(ctx context.Context, r Runner, st Step) (string, error) {
	res, err := r.Run(ctx, st.Stdin, st.Argv...)
	if err != nil {
		return "", err
	}
	if res.Code != 0 {
		msg := lastLine(res.Stderr)
		if msg == "" {
			msg = lastLine(res.Stdout)
		}
		return "", fmt.Errorf("%s (exit %d)", msg, res.Code)
	}
	// claude 2.1.289 exits 0 when it installs but rejects a --config value, and
	// says so on a ⚠ line naming --config. Other ⚠ lines are advice, not failure.
	for _, l := range strings.Split(res.Stdout+"\n"+res.Stderr, "\n") {
		if l = strings.TrimSpace(l); strings.HasPrefix(l, "⚠") && strings.Contains(l, "--config") {
			return "", errors.New(strings.TrimSpace(strings.TrimPrefix(l, "⚠")))
		}
	}
	line := lastLine(res.Stdout)
	if i := strings.LastIndex(line, "✔ "); i >= 0 {
		line = line[i+len("✔ "):]
	}
	if line == "" {
		line = "done"
	}
	return line, nil
}
