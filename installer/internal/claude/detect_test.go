package claude

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
		{"same name, other marketplace", `[{"name":"glowup"}]`, `[{"id":"glowup@someone-else"}]`, State{MarketplaceAdded: true, Other: []string{"glowup@someone-else"}}},
	}
	for _, c := range cases {
		r := &fakeRunner{answers: map[string]Result{marketList: {Stdout: c.markets}, pluginList: {Stdout: c.plugins}}}
		got, err := Detect(context.Background(), r)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %+v, %v; want %+v", c.name, got, err, c.want)
		}
	}
}

func TestDetectOtherCopies(t *testing.T) {
	r := &fakeRunner{answers: map[string]Result{marketList: {Stdout: `[]`}, pluginList: {Stdout: `[{"id":"glowup@glowup"},{"id":"glowup@fork"},{"id":"glowup-extras@x"},{"id":"curt@curt"}]`}}}
	got, err := Detect(context.Background(), r)
	if err != nil || !got.Installed || !reflect.DeepEqual(got.Other, []string{"glowup@fork"}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestDetectIgnoresDisabledCopies(t *testing.T) {
	r := &fakeRunner{answers: map[string]Result{marketList: {Stdout: `[]`}, pluginList: {Stdout: `[{"id":"glowup@off","enabled":false},{"id":"glowup@on","enabled":true}]`}}}
	got, err := Detect(context.Background(), r)
	if err != nil || !reflect.DeepEqual(got.Other, []string{"glowup@on"}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestPluginDirCopies(t *testing.T) {
	root := t.TempDir()
	mk := func(name, plugin string) string {
		d := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Join(d, ".claude-plugin"), 0o755); err != nil {
			t.Fatal(err)
		}
		if plugin != "" {
			if err := os.WriteFile(filepath.Join(d, ".claude-plugin", "plugin.json"), []byte(plugin), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		return d
	}
	dev, other, broken, bare := mk("dev", `{"name":"glowup","version":"1"}`), mk("other", `{"name":"curt"}`), mk("broken", `{`), mk("bare", "")
	list := strings.Join([]string{other, dev, broken, bare, filepath.Join(root, "missing")}, string(filepath.ListSeparator))
	if got := PluginDirCopies(list); !reflect.DeepEqual(got, []string{dev}) {
		t.Fatalf("got %q", got)
	}
	if got := PluginDirCopies(""); got != nil {
		t.Fatalf("empty: %q", got)
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
