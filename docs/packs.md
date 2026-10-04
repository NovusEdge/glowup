---
title: Packs
description: Set a whole look with one name. Colors, row styles and motion in two layers, the four built-in packs, and how to make and share your own.
---

## What a pack is

A pack is one JSON file that sets a whole look. It has two layers:

- **Colors** is the palette, the style of the transcript rows, the border around cards (it also sets the shape of the status box and of the pane's section boxes), and a few extras such as an HP bar.
- **Motion** is the spinner and its shimmer.

A pack holds data only. Nothing in it runs. Sound and voice layers are planned for a later release. A pack file may already carry `sound` and `voice` keys; glowup ignores them.

A [theme](themes.md) is the palette inside a pack's colors layer. You can keep using themes on their own.

## The built-in packs

| Pack | Look |
| --- | --- |
| `classic` | Claude Code as it ships. The default. Nothing is restyled. |
| `crt` | Green phosphor on near-black. Retro tags on rows, a comet spinner, no shimmer. |
| `cozy` | Warm pastels. Rounded cards with a pink-to-cream gradient, an eyes spinner. |
| `arcade` | Neon on deep purple. Bold pink cards, an HP bar for context, a COMBO tag, a spinner that follows what Claude is doing. |

## Use a pack

| Command | What it does |
| --- | --- |
| `/glowup pack <name>` | Apply a pack to both layers. Prints `Pack: <name>`. |
| `/glowup pack list` | List built-in and installed packs. A filled dot marks the active one. |
| `/glowup pack save <name>` | Write the current look as a pack file. |
| `/glowup pack <url>` | Download a pack from an `https://` URL, install it and apply it. |
| `/glowup pack <url> --force` | Same, and replace an installed pack of that name. |
| `/glowup import <file>` | Turn a Ghostty or base16 color scheme into a pack. See [Import a color scheme](#import-a-color-scheme). |
| `/glowup export konsole` | Save the current colors as a Konsole color scheme under `$XDG_DATA_HOME/konsole` (default `~/.local/share/konsole`). |

The choice is saved, so the next session starts with it.

If the active look is not one pack, `pack list` adds a line such as `custom mix: colors arcade, motion crt, theme dusk`.

## Mix layers

The two layers are independent. You can have the colors of one pack and the motion of another, then put a theme on top of the colors.

- `/glowup pack <name>` sets both layers to that pack and clears any theme or spinner you set on top.
- `/glowup theme <name>` swaps the colors layer's palette, background and border color for the theme's. It keeps the pack's row style, border shape and extras, and recolors the gradient from the theme's accent.
- `/glowup config` asks which pack to apply, which sets both layers. See [Commands](commands.md#config).

If one layer fails to load, glowup uses `classic`'s for that layer only and shows one notice with the reason. A broken motion layer never costs you your colors.

## The file format

Packs live in `~/.claude/glowup/packs`, or `$CLAUDE_CONFIG_DIR/glowup/packs` when you set that. The file name is the pack name. Comments are allowed.

```jsonc title="~/.claude/glowup/packs/neon.json"
{
  "format": 1,                      // required
  "name": "neon",                   // lowercase letters, digits, dashes; 1-40
  "extends": "classic",             // another pack to start from
  "description": "neon on deep purple",
  "colors": {
    "theme": "classic",             // a theme to start the palette from
    "palette": { "accent": "#ff3ec8", "text": "#f0e6ff" },
    "bg": "#1a0b33",                // what braille and half-block fades blend toward
    "rows": "cards",                // classic | cards | minimal | retro
    "border": "bold",               // round | single | double | bold | classic
    "borderColor": "#ff3ec8",
    "gradient": ["#ff3ec8", "#38e8ff"],
    "extras": { "hp": true, "combo": true }
  },
  "motion": {
    "spinner": "orb-states",        // stock | comet | eyes | orb-states | clawd | shimmer
    "shimmer": 2,                   // 0 none, 1 soft, 2 fast
    "color": "#38e8ff"              // defaults to the palette's accent
  },
  "sound": {},                      // reserved for a later release
  "voice": {}                       // reserved for a later release
}
```

Every field except `format` and `name` is optional. `palette` takes the color names listed in the [theme reference](theme-reference.md).

A layer can also be the name of another pack: `"motion": "crt"` uses `crt`'s motion layer.

### Checks and limits

- The file is at most 64 KB.
- `format` must be `1`. A file with a higher number is refused with `made for a newer glowup`.
- Colors are `#rrggbb`.
- Text that glowup shows (names, description) must be printable: no control, zero-width or bidirectional characters. A description is at most 80 characters.
- Unknown keys are refused, except `sound` and `voice` at the top level.
- `extends` and layer references together go at most 8 deep. A loop, or a ninth level, is refused with the chain named.
- An unknown spinner id is not an error. A pack made for a later glowup may name a spinner this one lacks; glowup uses `stock` for it and says why.
- Any other bad value refuses the layer it is in.

### Install from a URL

`/glowup pack <url>` accepts `https://` only. It gives the server 10 seconds. It refuses a file over 64 KB, a name that is a built-in pack, and a name you already have, unless you add `--force`. It validates the whole file, including its `extends` chain, before it writes anything.

| Message | Cause |
| --- | --- |
| `Pack URLs must start with https://` | The URL uses another scheme. |
| `Could not download the pack (HTTP 404).` | The server answered with an error. |
| `Could not download the pack: ...` | The request failed or timed out. |
| `The pack is over 64 KB.` | The file is larger than the limit. |
| `"crt" is a built-in pack name; pick another.` | The name is taken. |
| `A pack named "neon" is installed already. Add --force to replace it.` | You have one with that name. |
| `A pack needs a "name" of lowercase letters, digits and dashes.` | The name is missing or has other characters. |

### Save and share

`/glowup pack save <name>` writes your current look, both layers, with `"format": 1`. The saved file is self-contained: it does not depend on any theme or pack of yours, so you can host it at an `https://` URL and others can install it. `save` refuses a built-in name and the name of a pack you already have, so it never overwrites one.

## Ask your agent to make a pack

glowup ships a skill that teaches your agent the pack format. Say what you want, for example "make me a glowup pack from this palette", or show it an image or point it at a terminal color scheme. The agent writes `~/.claude/glowup/packs/<name>.json`, checks that the text and role colors have enough contrast, and tells you to run `/glowup pack <name>`. If that prints an error, the agent fixes the file and you run it again.

## Import a color scheme

`/glowup import <file>` reads a color scheme from a local path (`~` works) and saves it as a pack with only a colors layer, then applies it. Two formats are supported, detected from the content:

- Ghostty theme files.
- base16 files (`.yaml`).

The file can be at most 64 KB. Add `--force` to replace an installed pack of the same name.

| Message | Cause |
| --- | --- |
| `Could not read <path>.` | The file is missing or unreadable. |
| `<path> is over 64 KB.` | The file is larger than the limit. |
| `not a Ghostty or base16 color scheme` | The content matches neither format. |

iTerm2 `.itermcolors` files are not supported yet.

## Row styles

A row style changes how your prompts, Claude's replies and tool calls look in the transcript. glowup never redraws what Claude Code draws inside a row (results, diffs, markdown). Styles wrap or prefix it.

| Style | Your prompt | Claude's reply | Tool call |
| --- | --- | --- | --- |
| `classic` | Claude Code's | Claude Code's | Claude Code's, plus the theme's kind glyph |
| `cards` | An accent side bar `▎` and a `you` label | A dim side bar, and a `claude` label on the first block of a reply | A dim bordered card with a mark: `✓`, `✗`, `■` for interrupted, `…` while running |
| `minimal` | A `› text` line | Claude Code's | A dim one-line `· Read src/auth.ts` once it finishes cleanly |
| `retro` | A `[YOU]` tag on its own line above your prompt | A `[CLAUDE]` tag on the first block | A `[READ  ]`-style tag, then `[ OK ]`, `[FAIL]`, `[STOP]` or `[....]` |

Every style except `classic` also leaves a one-column margin on the left of each row, so the transcript does not touch the window edge.

Only your own prompts are styled. Notifications and messages from other agents keep Claude Code's drawing, as do prompts you expand with ctrl+o or `--verbose`. The folded "Read 3 files" line and tool progress are left alone. In non-fullscreen mode, rows already printed to scrollback keep the style they had when printed.

The extras are two optional bits of the colors layer:

- `hp` replaces the context hearts with an HP bar: `HP ████████░░ 38% context left`.
- `combo` shows `COMBO x3` once three tool calls in a row succeed in one turn. An error, a failed test or a new turn resets it.

## The spinner library

| Id | Size | Looks like |
| --- | --- | --- |
| `stock` | Claude Code's | Claude Code's own line, untouched. |
| `comet` | 3×2 | A comet circling a faint ring, drawn in braille dots. |
| `eyes` | 9×2 | Two eyes that look around and blink, in half blocks. |
| `orb-states` | 4×2 | A braille orb whose motion follows the activity: thinking, searching, working, running, agents. |
| `clawd` | 5×2 | Clawd waving, in his own color. |
| `shimmer` | 1×1 | A still `✻` with a shimmering word. |

The shimmer is a wave of color across the spinner word, between the gradient's two colors (or the accent and the text color). Shimmer `1` is soft and `2` is fast.

Switch spinners without a new pack through `/glowup spinner <name>`. `/glowup spinner default` goes back to the pack's own.

## Reduced motion

With reduced motion on, the spinner is `stock`, there is no shimmer, and no pet. Colors and row styles still apply. See [Accessibility](accessibility.md).

## What a mod cannot change

- Claude Code's logo, the prompt box and the status bar stay stock. A pack changes the transcript rows, glowup's own pane and band, and the spinner line.
- A non-stock spinner replaces the whole spinner line, and Claude Code gives a mod no way to pass its token count into the new line. It shows elapsed time and `esc to interrupt`. The `stock` spinner keeps the token count.
- While Claude Code shows its own message, such as `Compacting conversation…`, you see Claude Code's line.
- A mod cannot hide Claude Code's own task list. glowup's Plan & context tab mirrors it.
- glowup cannot read your operating system's reduced-motion setting.
