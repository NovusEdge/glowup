<div align="center">

# glowup

**A glow-up for Claude Code.** A live pane for changes, subagents and context, a one-line activity band, packs and themes you write as JSON and share by URL, and a pixel pet named Clawd.

[![CI](https://github.com/NovusEdge/glowup/actions/workflows/ci.yml/badge.svg)](https://github.com/NovusEdge/glowup/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/NovusEdge/glowup?include_prereleases)](https://github.com/NovusEdge/glowup/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.289%2B-d77757)](docs/install.md)

[Docs site](https://glowup.khimani.dev/) &nbsp;|&nbsp; [Latest release](https://github.com/NovusEdge/glowup/releases/latest)

</div>

<img src="docs/assets/hero.gif" alt="A cut of the launch video: Claude Code with the arcade pack and the glowup pane docked beside the transcript. Claude edits a file, a test fails and Clawd says 'ouch, 1 failed', then the fix passes, the level bar flashes LEVEL UP and Clawd hops" width="100%">

<p align="center"><sub>A cut of the launch video, in the arcade pack with the pane docked: Claude edits a file, a test fails and costs a life, the fix passes, and Clawd hops as the level goes up. The full video also switches packs and shows the Plan &amp; context tab.</sub></p>

glowup is a Claude Code mod. It adds to the terminal UI and leaves your transcript and prompt where they are.

## What you get

<table>
<tr>
<td width="50%" valign="top">

### The cockpit pane

Three tabs, each drawn as a box in your pack's border shape. Press the number key or click.

- **Changes** answers "what did Claude touch?" Files Claude edited or created, with `+added −removed` counts from git.
- **Agents** answers "what are the subagents doing?" Name, time, tokens, and the tool each is running now.
- **Plan & context** answers "how far along are we, and how full is the window?" The task list in one box. In a second box, a context bar split by what fills the window, and the context over the session.

The status box under the tabs shows the current action, the running subagents, and a row of hearts for the usage you have left: the 5-hour or weekly limit, whichever is tighter. On an API key, it shows what the session has spent instead.

</td>
<td width="50%" valign="top">

<img src="docs/assets/pane-wide.png" alt="The docked pane on the Changes tab: three files in a box with their added and removed counts, and below it the status box reading Done, four hearts for the 5-hour limit and Clawd">

<sub>Changes tab, with the status box below it: Done, the usage hearts, and Clawd.</sub>

</td>
</tr>
<tr>
<td width="50%" valign="top">

<img src="docs/assets/agents.png" alt="The docked pane on the Agents tab: a running Explore subagent with its task and the grep it is running, a finished subagent below it, and the status box naming the running one">

<sub>Agents tab: one subagent mid-grep, one finished.</sub>

</td>
<td width="50%" valign="top">

### The activity band

One line above the prompt while Claude works. It shows the current action, running subagents, plan progress, and five hearts for the context you have left. Each heart is 20% of the window.

<img src="docs/assets/band.png" alt="The band reading: 1 test failed, 1 subagent, five hearts">

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Themes

A theme is one JSON file: colors, a few glyphs, spinner words and band hearts. Seven presets ship. It is the palette inside a pack. A theme can `extends` another, so you write only what differs. Share one by hosting the file at an `https://` URL.

</td>
<td width="50%" valign="top">

### The status line

While Claude or a subagent is working, glowup adds one entry under the prompt and clears it when the work is done. You pick its fields and their order, such as activity, context, 5-hour and weekly usage, branch or cost, with `/glowup statusline fields <ids>`. glowup asks once, at first run, whether it should draw the whole line; answer No and your status line is left alone. If you want glowup to draw the whole line, opt in with `/glowup statusline on`. `/glowup statusline restore` puts yours back.

</td>
</tr>
</table>

## Install

You need Claude Code 2.1.289 or later. In a terminal, run:

```sh
curl -fsSL https://glowup.khimani.dev/install.sh | sh
```

You pick a pack (and, if you like, its colors and spinner on their own), a pet and two extras while a preview shows each choice, then the installer adds the mod through Claude Code's own `claude plugin` commands. It runs once from a temp folder: nothing goes on your PATH and nothing needs sudo. To read the script first, run `curl -fsSL https://glowup.khimani.dev/install.sh | less`.

To install by hand instead, run these in Claude Code:

```text
/plugin marketplace add NovusEdge/glowup
/plugin install glowup@glowup
```

Run `/glowup` with no arguments to print the usage. To run from a clone instead:

```sh
git clone https://github.com/NovusEdge/glowup
cd glowup
claude --plugin-dir .
```

glowup runs one copy per session: with an installed copy and `claude --plugin-dir .` together, the clone stays on and the other turns itself off. More in [Install](docs/install.md).

## Commands

`/glowup` alone shows a short card with the commands most people need, and `/glowup help all` lists them all.

| Command | What it does |
| --- | --- |
| `/glowup help all` | Every command, in groups. |
| `/glowup theme <name>` | Switch theme. Saved for the next session. |
| `/glowup theme list` | List built-in and installed themes. A filled dot marks the current one. |
| `/glowup theme add <url>` | Install a theme file from an `https://` URL. |
| `/glowup pack <name\|url>` | Apply a pack, or install one from an `https://` URL first. |
| `/glowup pack list` | List packs. A filled dot marks the active one. |
| `/glowup pack save <name>` | Save the current look as a pack file. |
| `/glowup spinner <name\|list\|default>` | Set just the spinner, list them, or go back to the pack's own. |
| `/glowup import <file>` | Turn a Ghostty or base16 color scheme into a pack. |
| `/glowup export konsole` | Write your current colors as a Konsole color scheme. |
| `/glowup pet clawd\|off` | Show Clawd or hide the pet. |
| `/glowup bubbles on\|off\|haiku` | Turn speech bubbles on or off, or let Haiku write some lines (small calls on your account). |
| `/glowup config` | Pick a pack, pet and extras by answering questions. |
| `/glowup pane` | Open or close the glowup pane. |
| `/glowup motion reduced` | Turn glowup's animation off. |
| `/glowup motion full` | Turn it back on. |
| `/glowup statusline on` | Ask first, then let glowup draw your status line. |
| `/glowup statusline fields <ids>` | Choose the status line fields and their order. `default` resets them. |
| `/glowup statusline restore` | Put your own status line back. |

Details are in [Commands](docs/commands.md).

## Themes

Presets: `classic` is the default and is Claude Code's own palette. The other presets extend it.

| Preset | Accent |
| --- | --- |
| `glowup` | `#ffc857` |
| `aurora` | `#5ef1c6` |
| `dusk` | `#b69cff` |
| `classic` | `#d77757` |
| `cyberpunk` | `#ff2bd6` |
| `vaporwave` | `#ff71ce` |
| `high-contrast` | `#ffff00` |

A minimal theme. Save it as `~/.claude/glowup/themes/ember.json`; the file name is the theme name.

```json
{
  "name": "ember",
  "extends": "cyberpunk",
  "colors": { "accent": "#ff8a4c" },
  "spinner": { "words": ["Smoldering", "Glowing"] }
}
```

Then run `/glowup theme list` and `/glowup theme ember`.

To install someone else's theme, host the JSON at an `https://` URL and run:

```text
/glowup theme add https://example.com/ember.json
/glowup theme ember
```

`theme add` refuses files over 64 KB and names that clash with a preset. A theme holds data only; nothing in it runs.

A theme you pick with `/glowup theme` is stored, and it overrides the theme chosen in the Claude Code settings menu. This is deliberate. There is no command to clear the stored choice.

Full guide: [Making a theme](docs/themes.md) and the [theme reference](docs/theme-reference.md).

## Packs

A pack sets a whole look with one name: colors, row styles and the border shape of the pane's boxes in one layer, motion (the spinner and its shimmer) in another. Four ship: `classic` (the default, Claude Code as it is), `crt`, `cozy` and `arcade`.

```text
/glowup pack arcade
```

`/glowup pack list` shows what you have, `/glowup pack save <name>` writes your current look to a file, and `/glowup pack <url>` installs someone else's. `/glowup import <file>` turns a Ghostty or base16 color scheme into a pack. Or ask your agent to make one from a mood, palette, image or scheme: glowup ships a skill for it. Full guide: [Packs](docs/packs.md).

## Pets

Clawd is a small pixel pet at the bottom of the glowup pane. He types at his keyboard while Claude edits files or runs commands, walks while it reads, searches and plans, juggles while three or more subagents run, hops when a test passes, sags and sweats when one fails (and keeps the sweat drop until your next prompt), startles and then waits with a `?` when Claude needs you, crumples up a sheet of paper when the context is compacted, pants once the context window is 80% full, does a little dance when a turn finishes, sleeps after one idle minute and stretches when he wakes, sweats in a special outfit on a Friday deploy, and says a short line in a speech bubble. Keep your tests green and see what happens.

```text
/glowup pet off
```

Reduced motion hides him. Full guide: [Pets](docs/pets.md).

## Config

`/glowup config` asks five questions: the pack, the spinner, the pet, extras such as bubbles, reduced motion and color tweaks, and the status line fields. Each answer applies at once, and Esc stops.

```text
/glowup config
```

glowup's settings also appear under Claude Code's `/plugin` menu. The last change wins, whether you make it there or with a `/glowup` command. A change in `/plugin` applies at the next session start or after `/reload-plugins`.

See [Commands](docs/commands.md#config).

## Layout by terminal width

glowup picks a layout from your terminal width. Your transcript and prompt never move.

| Tier | When | What you see |
| --- | --- | --- |
| Wide | The pane is docked beside the transcript | The full pane. No band, since the pane shows the same things. |
| Medium | 80 columns or more, pane not docked | The one-line band. The pane is a drawer you open with `/glowup pane`. |
| Compact | Under 80 columns | The band, cut to fit. The drawer is small: a tab strip and at most six rows. |

<img src="docs/assets/compact.png" alt="The compact layout in a narrow terminal: a tab strip with two changed files and Clawd's one-row glyph, then the band reading 142 tests passing" width="60%">

The pane docks in fullscreen, at 144 columns or more, or from 110 columns once you have opened it yourself. See [Layout](docs/layout.md).

## Accessibility

- `/glowup motion reduced` (or the `reducedMotion` setting) uses the stock spinner, turns off the shimmer and hides the pet. glowup does not flash.
- The `high-contrast` theme uses pure white text and fully saturated colors.
- Under 80 columns, every line is cut to fit with an ellipsis. Color is never the only signal: states also have glyphs and words.

See [Accessibility](docs/accessibility.md).

## Roadmap

Coming, in no promised order and with no dates:

- Sound and voice layers for packs.
- More spinners, and more pets: Kit and Blip.

Also planned: a diff view in the Changes tab and opening an agent from the Agents tab. See [Roadmap](docs/roadmap.md).

## Contributing

Run `just --list` to see the dev recipes. `just setup` installs dependencies, `just ci` runs what CI runs, and `just dev` opens Claude Code with your checkout loaded. See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
