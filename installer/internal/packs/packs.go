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

type Spinner struct {
	ID    string   `json:"id"`
	Word  string   `json:"word"`
	Color string   `json:"color"`
	Frame [][]Cell `json:"frame"`
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

var all = mustParse(raw)

// mustParse rejects unknown fields so a renamed key in hooks/packexport.ts fails the Go tests
// instead of leaving a preview color silently empty.
func mustParse(b []byte) []Pack {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	var ps []Pack
	if err := dec.Decode(&ps); err != nil {
		panic("packs.json: " + err.Error())
	}
	return ps
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

// ByName returns the named pack, or false when there is none.
func ByName(name string) (Pack, bool) {
	for _, p := range all {
		if p.Name == name {
			return p, true
		}
	}
	return Pack{}, false
}
