---
title: Making a theme
description: Write a theme file, try it, and share it with other people.
---

A theme is the color part of a [pack](packs.md). Applying a theme with `/glowup theme <name>` recolors the pack you are using and keeps its row style, borders and extras. Besides colors, a theme can set the spinner words, the heart characters and the small glyphs glowup puts on tool rows.

glowup ships seven themes. `classic`, the default, uses Claude Code's own colors; the others are `glowup`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` and `high-contrast`. Themes color glowup's text and leave the terminal background alone.

## Making one

A theme is a JSON file (comments allowed) in `~/.claude/glowup/themes`, or `$CLAUDE_CONFIG_DIR/glowup/themes` if you set that variable. The file name is the theme's name, so `sunset.json` is applied with `/glowup theme sunset`.

You only need to write what differs from an existing theme: name it in `extends` and glowup fills in the rest. A theme without `extends` starts from `classic`.

This one starts from `vaporwave`, changes six colors, and sets its own spinner words, hearts and two glyphs:

```jsonc title="~/.claude/glowup/themes/sunset.json"
{
  // The name is what `/glowup theme add` uses to save the file.
  "name": "sunset",
  "extends": "vaporwave",

  "colors": {
    "accent": "#ff8a4c",
    "text": "#fff1e6",
    "dim": "#b89a8c",
    "faint": "#4a2f2a",
    "read": "#ffd166",
    "fail": "#ff5d73"
  },

  "spinner": { "words": ["Basking", "Setting", "Glowing"] },

  "glyphs": { "edit": "✦", "agent": "❖" },

  "band": { "hearts": ["♦", "♢"] }
}
```

Every field is optional. The [theme reference](theme-reference.md) lists them all with their limits.

## When it does not load

If something in the file is wrong, `/glowup theme <name>` prints the reason and keeps your current theme; at session start, glowup falls back to `classic` and shows the reason in a notice. The usual causes are a color that is not written as six hex digits (`#d77757`, not `#d77`), a glyph that is an emoji or more than one character, a trailing comma, or a spinner word over 24 characters.

## Sharing

Host the file anywhere it can be fetched over `https://`, such as a gist. Anyone can then install it:

```text title="claude code"
/glowup theme add https://example.com/sunset.json
/glowup theme sunset
```

For `theme add` the file needs a `"name"` of lowercase letters, digits and dashes that is not one of the built-in names. A theme is plain data limited to 64 KB, so installing one cannot run code, and glowup rejects characters that could move the cursor or hide text.

To get a theme included in glowup itself, open a theme submission issue on GitHub with the file and a screenshot, or a pull request that adds it.
