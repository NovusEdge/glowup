package claude

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
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
	// Configure marks a `plugin configure` step. The installed glowup may be older
	// than this installer, so the app drops the keys it does not declare (Restrict).
	Configure bool
}

// BaseKeys are the userConfig options every released glowup declares. A fresh
// install sends only these: `plugin install --config` fails on an unknown key.
var BaseKeys = []string{"pack", "pet", "bubbles", "reducedMotion", "theme"}

// Plan returns the commands that take Claude Code from s to glowup installed with c.
// A marketplace that is already added is skipped. An installed glowup gets its
// settings updated through `plugin configure --values-stdin` instead of a reinstall.
func Plan(c Choice, s State) []Step { return PlanKeys(c, s, nil) }

// PlanKeys is Plan, except an installed glowup gets only the named userConfig keys
// (all of pack, pet, bubbles and reducedMotion when keys is nil, plus theme and
// spinner when the choice has them). A fresh install sends the BaseKeys, then a
// configure step for the spinner ("pack" when none was picked).
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
			Title:     "Updating glowup's settings",
			Argv:      []string{"claude", "plugin", "configure", PluginID, "--values-stdin"},
			Stdin:     valuesJSON(c, keys),
			Configure: true,
		})
	}
	argv := []string{"claude", "plugin", "install", PluginID}
	for _, kv := range values(c) {
		if slices.Contains(BaseKeys, kv[0]) {
			argv = append(argv, "--config", kv[0]+"="+kv[1])
		}
	}
	steps = append(steps, Step{Title: "Installing glowup", Argv: argv})
	// The spinner arrived after 0.2, so it goes in once the installed version can say
	// whether it takes it. Always sent, "pack" when unpicked: a spinner left unset
	// makes Claude Code report "1 userConfig option not yet set" after the install.
	stdin, _ := json.Marshal(map[string]string{"spinner": cmp.Or(c.Spinner, "pack")})
	return append(steps, Step{
		Title:     "Setting glowup's spinner",
		Argv:      []string{"claude", "plugin", "configure", PluginID, "--values-stdin"},
		Stdin:     string(stdin),
		Configure: true,
	})
}

// ValueGated lists option values an older glowup accepts as text but ignores. They
// count as declared only through a "key=value" entry in Declared's result.
var ValueGated = map[string]string{"bubbles": "haiku"}

// Declared asks the installed glowup which userConfig options it has: the keys of
// `plugin configure --json`'s "schema", plus "key=value" for each ValueGated value
// the option's description names. A schema that carries no description for the
// option is given the benefit of the doubt.
func Declared(ctx context.Context, r Runner) ([]string, error) {
	var out struct {
		Schema map[string]struct {
			Description *string `json:"description"`
		} `json:"schema"`
	}
	if err := runJSON(ctx, r, &out, "claude", "plugin", "configure", PluginID, "--json"); err != nil {
		return nil, err
	}
	if len(out.Schema) == 0 {
		return nil, errors.New("it listed no options")
	}
	keys := make([]string, 0, len(out.Schema))
	for k, o := range out.Schema {
		keys = append(keys, k)
		if v, ok := ValueGated[k]; ok && (o.Description == nil || strings.Contains(strings.ToLower(*o.Description), v)) {
			keys = append(keys, k+"="+v)
		}
	}
	slices.Sort(keys)
	return keys, nil
}

// Dropped is a pick the installed glowup cannot take yet.
type Dropped struct{ Key, Value string }

// Restrict returns a configure step without the keys declared lacks, and what it dropped.
func Restrict(st Step, declared []string) (Step, []Dropped) {
	var m map[string]string
	_ = json.Unmarshal([]byte(st.Stdin), &m)
	var dropped []Dropped
	for _, k := range slices.Sorted(maps.Keys(m)) {
		gated := ValueGated[k] != "" && ValueGated[k] == m[k]
		if !slices.Contains(declared, k) || (gated && !slices.Contains(declared, k+"="+m[k])) {
			dropped = append(dropped, Dropped{k, m[k]})
			delete(m, k)
		}
	}
	b, _ := json.Marshal(m)
	st.Stdin = string(b)
	return st, dropped
}

// values is the userConfig pairs in the order the install argv lists them.
// theme=classic is the mod's "no theme override" value (hooks/register.tsx ignores a
// classic theme and uses the pack's palette), and spinner=pack is its "no spinner
// override" value, so the pack picked here is the look the person gets. Leaving
// theme unset makes `claude plugin install` report an unset option.
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
