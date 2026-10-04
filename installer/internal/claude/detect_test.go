package claude

import (
	"context"
	"testing"
)

const (
	marketList = "claude plugin marketplace list --json"
	pluginList = "claude plugin list --json"
)

func TestDetect(t *testing.T) {
	cases := []struct {
		name    string
		markets string
		plugins string
		want    State
	}{
		{"fresh machine", `[]`, `[]`, State{}},
		{"marketplace only", `[{"name":"curt","source":"github"},{"name":"glowup","source":"github","repo":"NovusEdge/glowup"}]`, `[{"id":"curt@curt"}]`, State{MarketplaceAdded: true}},
		{"installed", `[{"name":"glowup"}]`, `[{"id":"glowup@glowup","version":"0.3.0","enabled":true}]`, State{MarketplaceAdded: true, Installed: true}},
		{"same name, other marketplace", `[{"name":"glowup"}]`, `[{"id":"glowup@someone-else"}]`, State{MarketplaceAdded: true}},
	}
	for _, c := range cases {
		r := &fakeRunner{answers: map[string]Result{marketList: {Stdout: c.markets}, pluginList: {Stdout: c.plugins}}}
		got, err := Detect(context.Background(), r)
		if err != nil || got != c.want {
			t.Errorf("%s: got %+v, %v; want %+v", c.name, got, err, c.want)
		}
	}
}

func TestDetectFailures(t *testing.T) {
	for name, answers := range map[string]map[string]Result{
		"list exits non-zero": {marketList: {Code: 1, Stderr: "not logged in\n"}, pluginList: {Stdout: `[]`}},
		"list prints text":    {marketList: {Stdout: `[]`}, pluginList: {Stdout: "No plugins installed\n"}},
	} {
		if _, err := Detect(context.Background(), &fakeRunner{answers: answers}); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}
