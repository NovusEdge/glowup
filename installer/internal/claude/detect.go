package claude

import (
	"context"
	"encoding/json"
	"fmt"
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
