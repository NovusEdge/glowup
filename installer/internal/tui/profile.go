package tui

import (
	"io"
	"strconv"
	"strings"

	"charm.land/huh/v2"
	"github.com/charmbracelet/colorprofile"
)

// ColorProfile is the palette the picker draws with. colorprofile.Detect stops at
// 16 colors for TERM=xterm, which turns the preview's palette into pure blue, red and
// magenta; xterm has had 256 colors for decades, and says it has 24-bit through
// XTERM_VERSION (patch 331 on). Only xterm sets that variable, and it is read only
// when TERM names an xterm, so no terminal is asked anything.
// NO_COLOR and a dumb terminal come back from Detect as ASCII and NoTTY and stay so.
func ColorProfile(out io.Writer, environ []string) colorprofile.Profile {
	p := colorprofile.Detect(out, environ)
	if p != colorprofile.ANSI {
		return p
	}
	env := map[string]string{}
	for _, kv := range environ {
		k, v, _ := strings.Cut(kv, "=")
		env[k] = v
	}
	if !strings.HasPrefix(env["TERM"], "xterm") {
		return p
	}
	if v := strings.TrimSuffix(strings.TrimPrefix(env["XTERM_VERSION"], "XTerm("), ")"); env["XTERM_VERSION"] != v {
		if n, err := strconv.Atoi(v); err == nil && n >= 331 {
			return colorprofile.TrueColor
		}
	}
	return colorprofile.ANSI256
}

// theme is huh's charm theme with the list items in the terminal's own foreground.
// The form is never told whether the background is light or dark, and the theme's
// fixed light gray for an unselected item is bright white once ANSI has it, which
// vanishes on xterm's white background.
func theme(isDark bool) *huh.Styles {
	t := huh.ThemeCharm(isDark)
	for _, s := range []*huh.FieldStyles{&t.Focused, &t.Blurred} {
		s.Option = s.Option.UnsetForeground()
		s.UnselectedOption = s.UnselectedOption.UnsetForeground()
	}
	return t
}
