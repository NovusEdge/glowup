---
name: glowup-pack
description: Use when the user asks for a new glowup pack, theme or look, or wants a palette, color scheme, image, screenshot or mood turned into one, for example "make me a glowup theme", "turn this palette into a glowup pack", "glowup look like this picture".
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

## Contrast

Check against `bg`, and against `panel` when `rows` is `cards`.

- `text` at least 4.5:1. `dim` at least 4.5:1. `faint` at least 3:1.
- `accent`, `read`, `edit`, `shell`, `agent`, `fail` at least 3:1 each, and no two of them close in hue and lightness. `pass` may equal `shell`.
- `text` at least 4.5:1 on `addBg`, `delBg` and `sel`.

Relative luminance of `#rrggbb`: for each channel `c` in 0 to 255, `s = c / 255`, then `lin = s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ^ 2.4`. `L = 0.2126 R + 0.7152 G + 0.0722 B`. Contrast is `(Llighter + 0.05) / (Ldarker + 0.05)`. Compute it with a short script, not by eye. If a color fails, move its lightness, keep its hue, and compute again.
