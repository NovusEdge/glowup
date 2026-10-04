---
name: glowup-pack
description: Use when the user asks for a new glowup pack, theme or look, wants a palette, color scheme, image, screenshot or mood turned into one, or wants to change an existing pack, theme or color, for example "make me a glowup theme", "turn this palette into a glowup pack", "make arcade less pink", "drop the labels in cozy".
---

# Make a glowup pack

A pack is one JSON file that sets a whole look: palette, transcript row style, spinner and shimmer. Every field and allowed value is in [reference.md](reference.md). Use only what it lists. glowup refuses unknown keys and bad values.

## Steps

1. **Source.** A mood or description, a palette, an image the user shows, or a terminal color scheme. If the request has none, ask for one in a single question. Otherwise do not ask.
2. **Terminal scheme file** (Ghostty or base16): run `/glowup import <file>` first. It saves a pack with a palette and `bg`. Then edit that file for rows, spinner and contrast. Other formats, an image or a description: read the colors yourself and write the pack.
3. **Name.** Lowercase letters, digits and dashes, 1 to 40 characters, starting with a letter or digit, not `classic`, `crt`, `cozy` or `arcade`. Check `~/.claude/glowup/packs` so you do not overwrite a pack the user made.
4. **Write** `~/.claude/glowup/packs/<name>.json` (`$CLAUDE_CONFIG_DIR/glowup/packs/` if set). Start the palette from a built-in theme with `colors.theme` and set only the colors that differ. Set `bg` to the user's terminal background if known. Pick `rows`, `spinner` and `shimmer` to fit the mood.
5. **Check contrast** and fix colors before you save. See below.
6. **Apply.** Tell the user to run `/glowup pack <name>`. If it prints errors, fix the file from the message and ask them to run it again. To match the terminal background in Konsole they can run `/glowup export konsole`.

A pack cannot hold glyphs or spinner words. For those, write a theme file (see Theme file in reference.md) and name it in `colors.theme`.

## Change an existing pack or theme

Built-in packs (`classic`, `crt`, `cozy`, `arcade`) and built-in themes live in glowup's code, so there is no file to edit. Do not write a file with a built-in's name: glowup ignores it.

1. **Small color tweak** ("make the accent greener", "dimmer text"): do not write a file. Tell the user to run `/glowup color <role> <#hex>`. It is saved, sits on top of any pack or theme, and survives `/glowup pack <name>`. `/glowup color list` shows the roles, `/glowup color reset [role]` undoes it. Use a file when the change is several colors, or anything that is not a color.
2. **Change a built-in**: write a new user pack that `extends` it and sets only the differences, for example `{ "format": 1, "name": "arcade-soft", "extends": "arcade", "colors": { "palette": { "accent": "#d46fb0" } } }`. `palette`, `extras` and `rowFlags` merge key by key; every other key you set replaces the parent's. The user needs `/glowup pack arcade-soft` to apply it. To start from the look they have now, with their overrides, run `/glowup pack save <name>`: it writes a self-contained file you can edit.
3. **Change one of their packs**: read `~/.claude/glowup/packs/<name>.json`, edit it in place, keep every key you were not asked to change, and tell them to run `/glowup pack <name>` again.
4. **What the pack can change**: `colors.palette`, `bg`, `border`, `borderColor`, `gradient`, `rows`, `extras`, `rowFlags` (`labels`, `markers`, `xp`), and `motion.spinner`, `shimmer`, `color`. `rowFlags.labels: false` drops the `you` and `claude` labels; `markers` swaps the side bar for `▶` (accent) and `◆` (`read`) in `cards`; `xp` adds a `+N XP` tag above replies in `cards`. A spinner alone can also be changed with `/glowup spinner <id>`.
5. **Glyphs and spinner words** are not pack fields. Write a theme file `~/.claude/glowup/themes/<name>.json` with `"extends": "<built-in or their theme>"` and only the `glyphs` or `spinner.words` you change, then set `colors.theme` to its name in the pack. Each glyph is one character, one cell wide.
6. **Check contrast** again for any palette color you changed, then have the user apply it.

## Status line fields

The status line fields are a personal setting, not part of a pack. They are an ordered list of ids, and the built-in default is `activity ctx 5h week`. A field with no data is left out.

| Id | Shows |
| --- | --- |
| `activity` | what Claude is doing: `◆ editing` |
| `ctx` | context used: `ctx 48%` |
| `5h` | 5-hour usage and reset: `5h 23% ↻2h10m` |
| `week` | weekly usage and reset: `wk 61% ↻Thu` |
| `cost` | session cost: `$1.24` |
| `model` | the model, as `/model` names it |
| `agents` | running subagents: `2 agents` |
| `plan` | plan progress: `plan 3/7` |
| `branch` | git branch |
| `changes` | lines added and removed: `+42 −7` |
| `cwd` | the project folder name |

When the person describes what they want on the line, tell them to run `/glowup statusline fields <ids>` with the ids they describe, in the order they name them. "Show my usage limits and branch" becomes `/glowup statusline fields activity 5h week branch`. `/glowup statusline fields default` goes back to the default. An unknown id refuses the whole command and lists the valid ids.

glowup draws the whole line only after `/glowup statusline on`. Without it, the fields show in the entry under the prompt while Claude works.

## Contrast

Check against `bg`, and against `panel` when `rows` is `cards`.

- `text` at least 4.5:1. `dim` at least 4.5:1. `faint` at least 3:1.
- `accent`, `read`, `edit`, `shell`, `agent`, `fail` at least 3:1 each, and no two of them close in hue and lightness. `pass` may equal `shell`.
- `text` at least 4.5:1 on `addBg`, `delBg` and `sel`.

Relative luminance of `#rrggbb`: for each channel `c` in 0 to 255, `s = c / 255`, then `lin = s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ^ 2.4`. `L = 0.2126 R + 0.7152 G + 0.0722 B`. Contrast is `(Llighter + 0.05) / (Ldarker + 0.05)`. Compute it with a short script, not by eye. If a color fails, move its lightness, keep its hue, and compute again.
