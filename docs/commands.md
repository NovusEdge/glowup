---
title: Commands
description: Every /glowup subcommand, what it prints, and when it fails.
order: 2
section: Use
---

## The /glowup command

You control glowup with `/glowup`. Run it with no arguments to print the usage text:

```text title="claude code"
glowup
  /glowup theme <name>       switch theme
  /glowup theme list         list installed themes
  /glowup theme add <url>    install a theme file from an https URL
  /glowup pane               open or close the glowup pane
  /glowup motion reduced|full
  /glowup statusline on|restore
```

An unknown subcommand prints `Unknown: <what you typed>` followed by the usage text.

## theme

| Command | What it does |
| --- | --- |
| `/glowup theme <name>` | Switch to a theme. Prints `Theme: <name>`. |
| `/glowup theme list` | List the built-in themes and your own. The current theme has a filled dot. |
| `/glowup theme add <url>` | Download a theme file, check it, and install it. |

The switch applies at once and is saved, so the next session starts with it. If the theme cannot load, glowup prints the reason and keeps the current theme. The built-in themes are `classic`, `cyberpunk`, `vaporwave` and `high-contrast`. Your own themes come from `~/.claude/glowup/themes`. See [Making a theme](themes.md).

### theme add

`theme add` takes an `https://` URL to a single JSON file. It then:

1. Refuses anything that is not `https://`.
2. Downloads the file. A download over 64 KB is refused.
3. Reads the `name` field. The name must be lowercase letters, digits and dashes, start with a letter or digit, and be at most 40 characters.
4. Refuses a name that is one of the four built-in themes.
5. Checks the whole file, including the `extends` chain, against the [theme reference](theme-reference.md).
6. Saves it as `<name>.json` in `~/.claude/glowup/themes`.

A theme file holds data only. Nothing in it runs. Adding a theme with a name you already have replaces that file. `theme add` does not switch to the new theme; run `/glowup theme <name>` after it.

| Message | Cause |
| --- | --- |
| `Theme URLs must start with https://` | The URL uses another scheme. |
| `Could not download the theme (HTTP 404).` | The server answered with an error. |
| `file is over 65536 bytes` | The file is larger than the limit. |
| `not valid JSON: ...` | The file does not parse. |
| `A theme must be a JSON object.` | The top level is an array or a plain value. |
| `A theme needs a "name" of lowercase letters, digits and dashes.` | The name is missing or has other characters. |
| `"cyberpunk" is a built-in theme name; pick another.` | The name is taken by a built-in theme. |
| `theme "<name>": ...` | A field failed validation. The text after the colon names it. |

## pane

`/glowup pane` opens the glowup pane if it is closed and closes it if it is open. When the pane has no room, it prints why instead. Esc closes the pane when you opened it with this command.

Where the pane appears depends on your terminal width. See [Layout](layout.md).

## motion

| Command | What it does |
| --- | --- |
| `/glowup motion reduced` | Turn glowup's animation off. |
| `/glowup motion full` | Turn it back on. |

The choice is saved. See [Accessibility](accessibility.md) for what changes.

## statusline

| Command | What it does |
| --- | --- |
| `/glowup statusline on` | Ask for confirmation, then let glowup draw your status line. |
| `/glowup statusline restore` | Put your own status line back. |

This is opt-in. Without it, glowup only adds its own entry under the prompt. See [Status line](statusline.md).
