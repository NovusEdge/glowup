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
  /glowup pack <name|url>    apply a pack (--force replaces an installed one)
  /glowup pack list          list packs
  /glowup pack save <name>   save the current look as a pack file
  /glowup config             pick a pack, pet and extras by answering questions
  /glowup import <file>      turn a Ghostty or base16 scheme into a pack
  /glowup pet clawd|off      choose the pet, or none
  /glowup bubbles on|off     speech bubbles
  /glowup pane               open or close the glowup pane
  /glowup motion reduced|full
  /glowup statusline on|restore
```

`/glowup config` asks up to three questions. See [config](#config).

An unknown subcommand prints `Unknown: <what you typed>` followed by the usage text.

## theme

| Command | What it does |
| --- | --- |
| `/glowup theme <name>` | Switch to a theme. Prints `Theme: <name>`. |
| `/glowup theme list` | List the built-in themes and your own. The active theme has a filled dot, including one chosen in the settings menu. |
| `/glowup theme add <url>` | Download a theme file, check it, and install it. |

The switch applies at once and is saved, so the next session starts with it. A theme sits on top of the current [pack](packs.md): it replaces the pack's palette and keeps its row style, border and extras. If the theme cannot load, glowup prints the reason and keeps the current theme. The built-in themes are `glowup`, `aurora`, `dusk`, `classic` (the default), `cyberpunk`, `vaporwave` and `high-contrast`. Your own themes come from `~/.claude/glowup/themes`. See [Making a theme](themes.md).

### theme add

`theme add` takes an `https://` URL to a single JSON file. It then:

1. Refuses anything that is not `https://`.
2. Downloads the file. A download over 64 KB is refused.
3. Reads the `name` field. The name must be lowercase letters, digits and dashes, start with a letter or digit, and be at most 40 characters.
4. Refuses a name that is one of the built-in themes.
5. Checks the whole file, including the `extends` chain, against the [theme reference](theme-reference.md).
6. Saves it as `<name>.json` in `~/.claude/glowup/themes`.

A theme file holds data only. Nothing in it runs. Adding a theme with a name you already have replaces that file. `theme add` does not switch to the new theme; run `/glowup theme <name>` after it.

| Message | Cause |
| --- | --- |
| `Theme URLs must start with https://` | The URL uses another scheme. |
| `Could not download the theme (HTTP 404).` | The server answered with an error. |
| `Could not download the theme: ...` | The request failed, for example no network. The text after the colon is the reason. |
| `file is over 65536 bytes` | The file is larger than the limit. |
| `not valid JSON: ...` | The file does not parse. |
| `A theme must be a JSON object.` | The top level is an array or a plain value. |
| `A theme needs a "name" of lowercase letters, digits and dashes.` | The name is missing or has other characters. |
| `"cyberpunk" is a built-in theme name; pick another.` | The name is taken by a built-in theme. |
| `theme "<name>": ...` | A field failed validation. The text after the colon names it. |

## pack

| Command | What it does |
| --- | --- |
| `/glowup pack <name>` | Apply a pack to both layers. Prints `Pack: <name>`. |
| `/glowup pack list` | List built-in and installed packs. A filled dot marks the active one. If the look is a mix of packs or has a theme or spinner on top, a last line starts `custom mix:` and names each layer. |
| `/glowup pack save <name>` | Save the current look as a self-contained pack file in `~/.claude/glowup/packs`. Prints `Saved pack "<name>" to <path>.` |
| `/glowup pack <url>` | Download, check and install a pack from an `https://` URL, then apply it. |
| `/glowup pack <url> --force` | The same, replacing an installed pack of that name. |

The built-in packs are `classic` (the default), `crt`, `cozy` and `arcade`. If a pack cannot load, glowup prints the reason and keeps the current look. The file format, limits and every refusal message are in [Packs](packs.md).

## import

`/glowup import <file>` turns a Ghostty or base16 color scheme into a pack with a colors layer, saves it in `~/.claude/glowup/packs` and applies it. The file can be at most 64 KB. Add `--force` to replace an installed pack of the same name. See [Packs](packs.md#import-a-color-scheme).

## pet and bubbles

| Command | What it does |
| --- | --- |
| `/glowup pet clawd` | Show Clawd. Prints `Pet: clawd`. |
| `/glowup pet off` | Hide the pet. Prints `Pet: off`. |
| `/glowup pet list` | List the pets you can pick. A filled dot marks the current one. |
| `/glowup pet clawd-shiny` | The shiny Clawd. Prints `The shiny pet is not unlocked yet.` until you earn him. |
| `/glowup bubbles on` | Turn speech bubbles on. Prints `Bubbles: on`. |
| `/glowup bubbles off` | Turn them off. |

See [Pets](pets.md).

## config

`/glowup config` asks up to three questions in Claude Code's own question dialog, and each answer applies as soon as you give it:

1. **Pack**: `arcade`, `classic`, `cozy` or `crt`, with the one in use marked `(current)`. Choose Other and type the name of a pack you installed to use that one. An unknown name prints an error and stops the questions.
2. **Pet**: Clawd, the shiny Clawd once you have unlocked him, or no pet.
3. **Extras**: pick any of "Turn bubbles on/off" and "Turn reduced motion on/off". The labels flip the current setting. Picking none changes nothing.

Esc on any question stops there. Answers you already gave stay applied. The command ends with a one-line summary, for example `glowup · arcade · Clawd · bubbles on · full motion`, drawn with the pack's colors.

Each answer does what the matching typed command does (`pack`, `pet`, `bubbles`, `motion`), so the questions add nothing the commands lack. The spinner, the colors and motion layers on their own, and saving a look are not in the questions: use `/glowup pack save <name>` to save the current look. In a `-p` run there is no one to ask, so `/glowup config` prints the command list instead.

## Settings and the store

The mod's settings in Claude Code's `/plugin` menu (`theme`, `pack`, `pet`, `bubbles` and `reducedMotion`) are defaults. glowup's own saved choice wins over a setting only after a `/glowup` command or the config questions have written that choice. After that, changing the value in `/plugin` has no effect until you use the matching `/glowup` command again. There is no command that clears a saved choice.

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

This is opt-in. Without it, glowup only adds its own entry under the prompt while Claude works. Restore puts your line back only if it is still glowup's. See [Status line](statusline.md).
