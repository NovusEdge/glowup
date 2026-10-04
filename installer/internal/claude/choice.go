package claude

// Choice is what the person picked. Values are the mod's userConfig values as
// .claude-plugin/plugin.json declares them.
type Choice struct {
	Pack          string // a name from packs.Names()
	Pet           string // "clawd" or "off"
	Bubbles       string // "on" or "off"
	ReducedMotion bool
}

// Defaults matches the "default" of each userConfig entry in .claude-plugin/plugin.json.
func Defaults() Choice {
	return Choice{Pack: "classic", Pet: "clawd", Bubbles: "on", ReducedMotion: false}
}
