---
title: Pack reference
description: The pack file format, validation rules, row styles and flags, extras and spinner ids.
---

For what packs are and how to use them, see [Packs](packs.md).

## File format

Packs are read from `~/.claude/glowup/packs`, or `$CLAUDE_CONFIG_DIR/glowup/packs` when that variable is set. The file name is the pack name, and comments are allowed.

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
    "extras": { "hp": true, "combo": true },
    "rowFlags": { "labels": false, "markers": true, "xp": true }
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

Every field except `format` and `name` is optional. `palette` takes the color roles listed in the [theme reference](theme-reference.md). A layer can also be the name of another pack: `"motion": "crt"` uses `crt`'s motion layer.

## Checks and limits

- The file is at most 64 KB.
- `format` must be `1`. A higher number is refused with `made for a newer glowup`.
- Colors are `#rrggbb`.
- Names and the description must be printable, with no control, zero-width or bidirectional characters. A description is at most 80 characters.
- Unknown keys are refused, except `sound` and `voice` at the top level.
- `extends` and layer references together go at most 8 deep. A loop or a ninth level is refused, with the chain named in the message.
- An unknown spinner id falls back to `stock` with a notice, so a pack made for a later glowup still loads.
- Any other bad value refuses the layer it is in, and that layer falls back to `classic`.

`/glowup pack <url>` accepts `https://` only, waits up to 10 seconds, and validates the whole file and its `extends` chain before writing. It refuses a built-in name, or the name of an installed pack unless `--force` is given.

## Row styles

Styles wrap or prefix a transcript row; the content Claude Code draws inside it is unchanged. Every style except `classic` adds a one-column left margin.

| Style | Your prompt | Claude's reply | Tool call |
| --- | --- | --- | --- |
| `classic` | Claude Code's | Claude Code's | Claude Code's, plus the theme's kind glyph |
| `cards` | An accent side bar `▎` and a `you` label | A dim side bar, and a `claude` label on the first block of a reply | A dim bordered card with a mark: `✓`, `✗`, `■` for interrupted, `…` while running |
| `minimal` | A `› text` line | Claude Code's | A dim one-line `· Read src/auth.ts` once it finishes cleanly |
| `retro` | A `[YOU]` tag on its own line above your prompt | A `[CLAUDE]` tag on the first block | A `[READ  ]`-style tag, then `[ OK ]`, `[FAIL]`, `[STOP]` or `[....]` |

Not styled: notifications, messages from other agents, prompts expanded with ctrl+o or `--verbose`, the folded "Read 3 files" line, and tool progress. Outside fullscreen, rows already in scrollback keep the style they were printed with.

## Row flags

`colors.rowFlags` holds three booleans.

| Flag | Default | Effect |
| --- | --- | --- |
| `labels` | `true` | The `you` and `claude` labels in `cards`, and `[YOU]` and `[CLAUDE]` in `retro`. |
| `markers` | `false` | In `cards`, your prompt starts with `▶ ` in the accent color and Claude's reply with `◆ ` in the `read` color, instead of the side bar. Later blocks of one reply are indented to line up. |
| `xp` | `false` | In `cards`, a `+N XP` tag in the `edit` color, right-aligned above Claude's reply. N is the number of successful tool calls in a row this turn when the reply first drew; the tag is omitted at 0. |

`cozy` turns `labels` off. `arcade` turns `labels` off and `markers` and `xp` on.

## Extras

- `hp` replaces the hearts with an HP bar: `HP ████████░░ 38% context left` in the band, `HP ████████░░ 38% weekly limit left` in the pane's status box.
- `combo` shows `COMBO x3` once three tool calls in a row succeed in one turn. An error, a failed test or a new turn resets it.

## Spinners

| Id | Cells | Looks like |
| --- | --- | --- |
| `stock` | Claude Code's | Claude Code's own line, untouched. |
| `comet` | 3×2 | A comet circling a faint ring, in braille dots. |
| `eyes` | 9×2 | Two eyes that look around and blink, in half blocks. |
| `orb-states` | 4×2 | A braille orb whose motion follows the activity: thinking, searching, working, running, agents. |
| `clawd` | 5×2 | Clawd waving, in his own color. |
| `shimmer` | 1×1 | A still `✻` with a shimmering word. |

The shimmer is a wave of color across the spinner word, between the gradient's two colors, or the accent and text colors when there is no gradient. `1` is soft and `2` is fast.

A non-stock spinner replaces Claude Code's whole spinner line, and Claude Code gives a mod no way to show its token count there, so the line shows elapsed time and `esc to interrupt` instead. The `stock` spinner keeps the token count. While Claude Code shows its own message, such as `Compacting conversation…`, its line is shown instead of the pack's.
