# glowup pack reference

Every field glowup's loaders accept. A test checks this file against the code, so a field missing here or listed here and not accepted fails CI.

A pack is a JSON file at `~/.claude/glowup/packs/<name>.json` (`$CLAUDE_CONFIG_DIR/glowup/packs/` when that variable is set). The file name is the pack name. `//` and `/* */` comments are allowed, trailing commas are not. At most 64 KB. Colors are `#rrggbb` only: no `#fff`, no names. Unknown keys are refused, except `sound` and `voice` at the top level.

## Pack file

| Field | Values | Meaning |
| --- | --- | --- |
| `format` | `1` | Required. |
| `name` | text, 1 to 40 characters | Required. Same as the file name: lowercase letters, digits and dashes, starting with a letter or digit, not `classic`, `crt`, `cozy` or `arcade`. |
| `extends` | a pack name | Start from another pack, built-in or yours. Your keys replace its keys. |
| `description` | printable text, at most 80 characters | One line about the look. |
| `colors` | object, or a pack name | The colors layer. A name uses that pack's colors layer. |
| `motion` | object, or a pack name | The motion layer. A name uses that pack's motion layer. |
| `sound` | anything | Reserved. Ignored. Leave it out. |
| `voice` | anything | Reserved. Ignored. Leave it out. |

## Colors layer

| Field | Values | Meaning |
| --- | --- | --- |
| `theme` | a theme name | Start the palette from this theme: `classic`, `glowup`, `aurora`, `dusk`, `cyberpunk`, `vaporwave`, `high-contrast`, or a file in `~/.claude/glowup/themes`. Default `classic`. |
| `palette` | object of theme color keys | Colors that replace the theme's. Keys are listed under Theme colors. Set only what differs. |
| `bg` | `#rrggbb` | The terminal background glowup fades toward. Match the user's terminal background. Default: the palette's `panel`. |
| `rows` | `classic`, `cards`, `minimal`, `retro` | Transcript row style. `classic` leaves rows alone, `cards` draws side bars and bordered tool cards, `minimal` is quiet one-liners, `retro` uses `[TAG]` labels. Default `classic`. |
| `border` | `round`, `single`, `double`, `bold`, `classic` | Border shape around cards. Also the shape of the status box and of the pane's section boxes. Default `round`. |
| `borderColor` | `#rrggbb` | Border color. Default: the palette's `faint`. |
| `gradient` | array of exactly two `#rrggbb` | Start and end color of the card gradient and spinner shimmer. Default: none. |
| `extras` | object | Optional extras, below. |
| `extras.hp` | `true`, `false` | Show an HP bar for context instead of hearts. Default `false`. |
| `extras.combo` | `true`, `false` | Show `COMBO x3` after three tool calls in a row succeed. Default `false`. |
| `rowFlags` | object | How message rows are drawn, below. Only `cards` uses `markers` and `xp`; `cards` and `retro` use `labels`. |
| `rowFlags.labels` | `true`, `false` | Show the `you` and `claude` labels (`[YOU]` and `[CLAUDE]` in `retro`). Default `true`. |
| `rowFlags.markers` | `true`, `false` | In `cards`, mark your prompt with `▶ ` in `accent` and Claude's reply with `◆ ` in `read`, instead of the side bar. Default `false`. |
| `rowFlags.xp` | `true`, `false` | In `cards`, draw `+N XP` right-aligned above a reply, N being the successful tool calls in a row so far this turn. Left out at 0, in `edit` color. Default `false`. |
| `meters` | `default`, `dither` | The usage rows in the pane's status box. `default` is hearts, or the HP bar with `extras.hp`; `dither` draws a bar per 5-hour and weekly window that ramps from `accent` to `text` and dissolves through `▓▒░` into `faint` dots. Default `default`. |
| `dividers` | `true`, `false` | Draw a numbered rule, `░▒▓━━ 03 ━━━▓▒░` in `faint` with the number in `accent`, above each of your prompts. Default `false`. |

## Motion layer

| Field | Values | Meaning |
| --- | --- | --- |
| `spinner` | `stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer` | The spinner. `stock` is Claude Code's own. Use only these: an id glowup lacks falls back to `stock` with a notice. Default `stock`. |
| `shimmer` | `0`, `1`, `2` | Shimmer across the spinner word: none, soft, fast. Default `1`. |
| `color` | `#rrggbb` | Spinner color. Default: the palette's `accent`. |
| `field` | `none`, `warp` | An animated texture in the docked pane's open rows, between the tab and the status box. `warp` is domain-warped noise dithered into braille dots, from a darkened `faint` to `accent`. It holds still under reduced motion. Default `none`. |

## Theme colors

These are the keys of `colors.palette`, and of `colors` in a theme file. All 14 are always set by the base theme, so list only the ones you change.

| Key | Used for |
| --- | --- |
| `accent` | Current plan item, progress pips, spinner, card side bar of your prompts. |
| `text` | Main text. |
| `dim` | Secondary text, separators, files that were only read. |
| `faint` | Empty parts of bars, borders, pane section borders, tree lines. |
| `read` | Read and search rows, running subagent work, low context. |
| `edit` | Edit rows, medium context, the context warning. |
| `shell` | Shell rows. |
| `agent` | Subagent rows. |
| `pass` | Passing tests, finished subagents, added-line counts. |
| `fail` | Failures, high context, removed-line counts. |
| `panel` | Panel and card fill. |
| `addBg` | Background of added lines. Dark tint of green. |
| `delBg` | Background of removed lines. Dark tint of red. |
| `sel` | Selection background. |

## Theme file

A theme is a separate file at `~/.claude/glowup/themes/<name>.json`, for what a pack cannot hold: glyphs, spinner words and hearts. A pack uses it through `colors.theme`. Unknown top-level keys in a theme file are ignored.

| Field | Values | Meaning |
| --- | --- | --- |
| `name` | lowercase letters, digits, dashes | Only `/glowup theme add` reads it. |
| `extends` | a theme name | Build on another theme. |
| `colors` | object of Theme colors keys | Same keys as `palette`. |
| `glyphs` | object of Theme glyphs keys | Tool-row marks. |
| `spinner.words` | array of strings, each at most 24 characters | Words for the spinner. |
| `band.hearts` | array of two single characters | Full and empty heart. |

## Theme glyphs

Each glyph is exactly one character, one cell wide, in the Basic Multilingual Plane. No emoji, no wide CJK, no control or zero-width characters.

| Key | Tool kind | Default |
| --- | --- | --- |
| `read` | Read | `▸` |
| `search` | Grep, Glob | `⌕` |
| `edit` | Edit, Write | `✎` |
| `shell` | Bash | `$` |
| `agent` | Subagent | `◆` |
| `plan` | Plan | `◇` |

## Worked example

A dusk-purple pack that starts from the `dusk` theme, uses cards and the `orb-states` spinner. It loads with no errors.

```json
{
  "format": 1,
  "name": "ember-dusk",
  "description": "ember orange on dusk purple",
  "colors": {
    "theme": "dusk",
    "palette": {
      "accent": "#ff8a5c",
      "text": "#f3e9f7",
      "dim": "#a898b8",
      "faint": "#7a6a8c",
      "read": "#6fd0ff",
      "edit": "#ffd166",
      "shell": "#7be0a0",
      "agent": "#d0a2ff",
      "pass": "#7be0a0",
      "fail": "#ff6b81",
      "panel": "#261d33",
      "addBg": "#1f3a2c",
      "delBg": "#40202c",
      "sel": "#33284a"
    },
    "bg": "#1c1526",
    "rows": "cards",
    "border": "round",
    "borderColor": "#7a6a8c",
    "gradient": ["#ff8a5c", "#ffd166"],
    "extras": { "hp": false, "combo": true }
  },
  "motion": {
    "spinner": "orb-states",
    "shimmer": 1,
    "color": "#ff8a5c"
  }
}
```
