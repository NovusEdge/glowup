package configtui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendWritesOneLinePerCall(t *testing.T) {
	dir := t.TempDir()
	if err := Append(dir, Line{Seq: 1, Cmds: []string{"pack crt"}}); err != nil {
		t.Fatal(err)
	}
	if err := Append(dir, Line{Seq: 2, Undo: true}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "commands.jsonl"))
	want := `{"seq":1,"cmds":["pack crt"]}` + "\n" + `{"seq":2,"undo":true}` + "\n"
	if string(b) != want {
		t.Fatalf("got %q, want %q", b, want)
	}
}

func TestReadStateParsesTheModsSnapshot(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "state.json"), []byte(`{"format":1,"seq":3,"lines":3,"version":"0.12.0","cwd":"/r",
	"note":{"text":"Pack: crt","tone":"ok"},
	"state":{"mix":{"colors":"crt","motion":"crt","overrides":{"accent":"#112233"}},"colors":{"accent":"#112233","text":"#e0e0e0","dim":"#909090","faint":"#505050","read":"#5fafff","edit":"#ffaf5f","shell":"#af87ff","agent":"#5fd7af","pass":"#5fd75f","fail":"#ff5f5f","panel":"#1c1c1c","addBg":"#001100","delBg":"#3a1f1f","sel":"#303030"},"pet":"clawd","bubbles":"on","reduced":false,
	"setup":{"format":1,"band":["combo"],"tabs":["plan"],"meter":{"warn":50,"danger":80},"bubbles":{"moods":["fail"],"ms":3000},"pet":{"sleepMs":60000}},"fields":["ctx"]},
	"look":{"name":"crt","bg":"#000000","border":"round","borderColor":"#333333","spinner":"orb","spinColor":"","word":"Working"},
	"options":{"packs":["classic","crt"],"spinners":["orb"],"pets":["clawd","off"],"fields":["ctx","cost"],"band":["combo","agents"],"tabs":["plan","diff"],"moods":["fail","done"],"bubbles":["on","off"]}}`), 0o600)
	s, ok := ReadState(dir)
	if !ok {
		t.Fatal("not parsed")
	}
	if s.Seq != 3 || s.State.Mix.Colors != "crt" || s.State.Mix.Overrides["accent"] != "#112233" || s.State.Colors.AddBg != "#001100" ||
		s.State.Setup.Meter.Danger != 80 || s.State.Setup.Bubbles.Ms != 3000 || s.State.Setup.Pet.SleepMs != 60000 ||
		s.Look.Border != "round" || len(s.Options.Packs) != 2 || s.Note.Text != "Pack: crt" {
		t.Fatalf("bad parse: %+v", s)
	}
}

func TestReadStateIgnoresAHalfWrittenFile(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "state.json"), []byte(`{"format":1,"seq":`), 0o600)
	if _, ok := ReadState(dir); ok {
		t.Fatal("a partial file parsed")
	}
	if _, ok := ReadState(t.TempDir()); ok {
		t.Fatal("a missing file parsed")
	}
}

func TestReadStateIgnoresASnapshotWithoutAllFourteenColors(t *testing.T) {
	for name, edit := range map[string]func(*Snapshot){
		"missing":      func(s *Snapshot) { s.State.Colors.Sel = "" },
		"short hex":    func(s *Snapshot) { s.State.Colors.Accent = "#fa0" },
		"named":        func(s *Snapshot) { s.State.Colors.Text = "red" },
		"bad look bg":  func(s *Snapshot) { s.Look.Bg = "black" },
		"bad look bdr": func(s *Snapshot) { s.Look.BorderColor = "#12345" },
	} {
		s := snap()
		edit(&s)
		b, _ := json.Marshal(s)
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
		if _, ok := ReadState(dir); ok {
			t.Fatalf("%s: accepted", name)
		}
	}
	dir := t.TempDir()
	b, _ := json.Marshal(snap())
	os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
	if _, ok := ReadState(dir); !ok {
		t.Fatal("a full snapshot with empty look colors was refused")
	}
}

func TestTouchLeavesOnlyOpen(t *testing.T) {
	dir := t.TempDir()
	if err := Touch(dir); err != nil {
		t.Fatal(err)
	}
	es, _ := os.ReadDir(dir)
	var names []string
	for _, e := range es {
		names = append(names, e.Name())
	}
	if strings.Join(names, ",") != "open" {
		t.Fatalf("got %v", names)
	}
}
