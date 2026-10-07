// Package packs is the mod's built-in packs as the installer previews them.
// packs.json is generated from hooks/packpresets.ts by `just packs`; never edit it by hand.
package packs

import (
	"bytes"
	_ "embed"
	"encoding/json"
)

//go:embed packs.json
var raw []byte

type Cell struct {
	Ch string `json:"ch"`
	Fg string `json:"fg"`
	Bg string `json:"bg,omitempty"`
}

type Colors struct {
	Accent string `json:"accent"`
	Text   string `json:"text"`
	Dim    string `json:"dim"`
	Faint  string `json:"faint"`
	Read   string `json:"read"`
	Edit   string `json:"edit"`
	Shell  string `json:"shell"`
	Agent  string `json:"agent"`
	Pass   string `json:"pass"`
	Fail   string `json:"fail"`
	Panel  string `json:"panel"`
	AddBg  string `json:"addBg"`
	DelBg  string `json:"delBg"`
	Sel    string `json:"sel"`
}

// Spinner is a pack's own spinner. Color is empty when the pack leaves it on the accent.
type Spinner struct {
	ID    string `json:"id"`
	Word  string `json:"word"`
	Color string `json:"color"`
}

// Theme is a built-in theme preset: colors and the first spinner word.
type Theme struct {
	Name   string `json:"name"`
	Word   string `json:"word"`
	Colors Colors `json:"colors"`
}

// SpinnerAnim is one spinner's frames, one per Ms. Cells are white on black; see
// Recolor for how the preview puts them onto a pack's colors.
type SpinnerAnim struct {
	ID     string     `json:"id"`
	Name   string     `json:"name"`
	Ms     int        `json:"ms"`
	Text   bool       `json:"text"`
	Frames [][][]Cell `json:"frames"`
}

// Span is a run of Clawd's half-block cells in one color.
type Span struct {
	Text  string `json:"text"`
	Color string `json:"color"`
	Bg    string `json:"bg,omitempty"`
}

// Clawd is the idle pose's first frame as rows of spans, each Cols cells wide.
type Clawd struct {
	Cols int      `json:"cols"`
	Rows [][]Span `json:"rows"`
}

type Pack struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Bg          string   `json:"bg"`
	Rows        string   `json:"rows"`
	Border      string   `json:"border"`
	BorderColor string   `json:"borderColor"`
	Gradient    []string `json:"gradient"`
	Colors      Colors   `json:"colors"`
	Spinner     Spinner  `json:"spinner"`
}

// CatalogEntry is an official pack the mod downloads on a person's first session. The
// installer knows only its name and description; the colors arrive with the download.
type CatalogEntry struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type file struct {
	Packs    []Pack         `json:"packs"`
	Catalog  []CatalogEntry `json:"catalog"`
	Themes   []Theme        `json:"themes"`
	Spinners []SpinnerAnim  `json:"spinners"`
	Clawd    Clawd          `json:"clawd"`
}

var data = mustParse(raw)
var all = data.Packs

// mustParse rejects unknown fields so a renamed key in hooks/packexport.ts fails the Go tests
// instead of leaving a preview color silently empty.
func mustParse(b []byte) file {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	var f file
	if err := dec.Decode(&f); err != nil {
		panic("packs.json: " + err.Error())
	}
	return f
}

// All returns the packs in the mod's preset order.
func All() []Pack { return append([]Pack(nil), all...) }

// Names returns the pack names in the mod's preset order.
func Names() []string {
	out := make([]string, len(all))
	for i, p := range all {
		out[i] = p.Name
	}
	return out
}

// Catalog returns the official packs from docs/web/public/packs.json, in index order.
func Catalog() []CatalogEntry { return append([]CatalogEntry(nil), data.Catalog...) }

// InCatalog reports whether name is an official catalog pack.
func InCatalog(name string) bool {
	for _, e := range data.Catalog {
		if e.Name == name {
			return true
		}
	}
	return false
}

// Known reports whether name is a built-in or a catalog pack.
func Known(name string) bool {
	_, ok := ByName(name)
	return ok || InCatalog(name)
}

// ByName returns the named built-in pack, or false when there is none.
func ByName(name string) (Pack, bool) {
	for _, p := range all {
		if p.Name == name {
			return p, true
		}
	}
	return Pack{}, false
}

// Themes returns the built-in themes in the mod's preset order.
func Themes() []Theme { return append([]Theme(nil), data.Themes...) }

// ThemeNames returns the built-in theme names in preset order.
func ThemeNames() []string {
	out := make([]string, len(data.Themes))
	for i, t := range data.Themes {
		out[i] = t.Name
	}
	return out
}

// ThemeByName returns the named theme, or false when there is none.
func ThemeByName(name string) (Theme, bool) {
	for _, t := range data.Themes {
		if t.Name == name {
			return t, true
		}
	}
	return Theme{}, false
}

// Spinners returns every spinner the mod has, in the mod's order.
func Spinners() []SpinnerAnim { return append([]SpinnerAnim(nil), data.Spinners...) }

// SpinnerIDs returns the spinner ids in the mod's order.
func SpinnerIDs() []string {
	out := make([]string, len(data.Spinners))
	for i, s := range data.Spinners {
		out[i] = s.ID
	}
	return out
}

// SpinnerByID returns the spinner with that id, or false when there is none.
func SpinnerByID(id string) (SpinnerAnim, bool) {
	for _, s := range data.Spinners {
		if s.ID == id {
			return s, true
		}
	}
	return SpinnerAnim{}, false
}

// ClawdSprite returns Clawd's idle frame.
func ClawdSprite() Clawd { return data.Clawd }
