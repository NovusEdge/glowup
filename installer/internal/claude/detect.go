package claude

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	MarketplaceSource = "NovusEdge/glowup"
	MarketplaceName   = "glowup"
	PluginID          = "glowup@glowup"
)

// State is what Claude Code already has.
type State struct {
	MarketplaceAdded bool
	Installed        bool
	// Other lists glowup copies from any other marketplace (ids like glowup@fork).
	// Two copies in one session each draw and each run the status line.
	Other []string
}

// PluginDirCopies returns the entries of dirs (CLAUDE_CODE_PLUGIN_DIRS, as the
// platform's path list) whose .claude-plugin/plugin.json names the plugin glowup.
func PluginDirCopies(dirs string) []string {
	var found []string
	for _, d := range filepath.SplitList(dirs) {
		b, err := os.ReadFile(filepath.Join(d, ".claude-plugin", "plugin.json"))
		var m struct {
			Name string `json:"name"`
		}
		if err == nil && json.Unmarshal(b, &m) == nil && m.Name == "glowup" {
			found = append(found, d)
		}
	}
	return found
}

// Detect asks Claude Code which marketplaces and plugins it has, through the
// --json forms of `plugin marketplace list` and `plugin list`.
func Detect(ctx context.Context, r Runner) (State, error) {
	var markets []struct {
		Name string `json:"name"`
	}
	if err := runJSON(ctx, r, &markets, "claude", "plugin", "marketplace", "list", "--json"); err != nil {
		return State{}, err
	}
	var plugins []struct {
		ID string `json:"id"`
		// nil when an older claude does not print it: counted as enabled
		Enabled *bool `json:"enabled"`
	}
	if err := runJSON(ctx, r, &plugins, "claude", "plugin", "list", "--json"); err != nil {
		return State{}, err
	}
	var s State
	for _, m := range markets {
		s.MarketplaceAdded = s.MarketplaceAdded || m.Name == MarketplaceName
	}
	for _, p := range plugins {
		s.Installed = s.Installed || p.ID == PluginID
		if p.ID != PluginID && strings.HasPrefix(p.ID, "glowup@") && (p.Enabled == nil || *p.Enabled) {
			s.Other = append(s.Other, p.ID)
		}
	}
	return s, nil
}

func runJSON(ctx context.Context, r Runner, into any, argv ...string) error {
	res, err := r.Run(ctx, "", argv...)
	if err != nil {
		return err
	}
	name := strings.Join(argv, " ")
	if res.Code != 0 {
		return fmt.Errorf("%s exited %d: %s", name, res.Code, lastLine(res.Stderr))
	}
	if err := json.Unmarshal([]byte(res.Stdout), into); err != nil {
		return fmt.Errorf("%s printed something other than JSON: %w", name, err)
	}
	return nil
}
