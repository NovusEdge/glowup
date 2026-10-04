---
title: Making a theme
description: Write a theme file, try it, and share it with other people.
order: 7
section: Themes
---

## What a theme is

A theme is the palette inside a [pack](packs.md)'s colors layer. Pick a pack for a whole look, or a theme for just the colors: `/glowup theme <name>` puts the theme's palette on top of the pack you use and keeps the pack's row style, border and extras.

A theme is one JSON file. It sets colors, a few glyphs, the spinner words and the band hearts. It holds data only; nothing in it runs. Comments are allowed in the file.

glowup ships seven themes: `glowup`, `aurora`, `dusk`, `classic`, `cyberpunk`, `vaporwave` and `high-contrast`. `classic` is the default and uses Claude Code's own colors. Switch with `/glowup theme <name>`. Themes color glowup's own text and do not change the terminal's background.

## Make one

1. Make the folder if it does not exist: `~/.claude/glowup/themes`. If you set `CLAUDE_CONFIG_DIR`, use `$CLAUDE_CONFIG_DIR/glowup/themes`.
2. Save a file there, for example `sunset.json`. The file name is the theme name.
3. Run `/glowup theme list`. Your theme is in the list.
4. Run `/glowup theme sunset`.

You only need to write what differs from another theme. Add `"extends"` and glowup fills in the rest. With no `extends`, a theme starts from `classic`.

## A full example

This theme extends `vaporwave`, changes six colors, sets its own spinner words and hearts, and swaps two glyphs.

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

Every field is optional except that a file must be a JSON object. The [theme reference](theme-reference.md) lists each field, its limits and what happens when a value is wrong.

## Check it

glowup checks a theme when you switch to it or add it. If a value is wrong, `/glowup theme <name>` prints the reason and keeps your current theme. At session start, a theme that fails to load shows a notice and glowup uses `classic`.

Common mistakes:

- A color is not six hex digits. Write `#d77757`, not `#d77` or `d77757`.
- A glyph is more than one character, or is a wide character such as an emoji.
- A trailing comma. Comments are allowed; trailing commas are not.
- A spinner word longer than 24 characters.

## Share it

To publish a theme, host the JSON file at an `https://` URL. A raw file in a GitHub repository or gist works. Anyone can then install it:

```text title="claude code"
/glowup theme add https://example.com/sunset.json
/glowup theme sunset
```

`theme add` needs a `"name"` field. The name must be lowercase letters, digits and dashes, and it must not be one of the built-in names. See [Commands](commands.md) for what `theme add` checks.

To get your theme into the project, open a theme submission issue on GitHub with the JSON file and a screenshot, or open a pull request that adds the file.

A theme cannot run code or read your files. glowup limits the file to 64 KB and refuses glyphs that move the cursor or hide text, so a downloaded theme can change how glowup looks and nothing else.
