package claude

// Choice is what the person picked. Values are the mod's userConfig values as
// .claude-plugin/plugin.json declares them.
type Choice struct {
	Pack          string // a name from packs.Names()
	Pet           string // "clawd" or "off"
	Bubbles       string // "on", "off" or "haiku"
	ReducedMotion bool
	// Theme and Spinner are empty until the person picks them. A configure run sends
	// them only then; a fresh install sends "classic" and "pack", the mod's values
	// for "no override: use the pack's own colors / spinner".
	Theme   string // a theme preset name, or "classic" for the pack's own colors
	Spinner string // a spinner id, or "pack" for the pack's own
}

// Defaults matches the "default" of each userConfig entry in .claude-plugin/plugin.json.
func Defaults() Choice {
	return Choice{Pack: "classic", Pet: "clawd", Bubbles: "on", ReducedMotion: false}
}
