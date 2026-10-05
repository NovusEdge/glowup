---
title: Commands
description: Every /glowup subcommand, what it prints, and when it fails.
---

## The /glowup command

You control glowup with `/glowup`. Run it with no arguments, or with `help`, for a short card of the five commands most people need:

```text title="claude code"
glowup

  /glowup config                       pick a look, pet and extras
  /glowup pack <name>                  switch look: arcade classic cozy crt
  /glowup pet clawd|off                Clawd, or no pet
  /glowup pane                         open or close the side pane
  /glowup motion reduced               calm everything down

more: /glowup help all   docs: https://glowup.khimani.dev/
```

`/glowup help all` lists every command in groups: Start here, Look, Pet, Comfort, Make your own and Status line. The Look group includes the `color` commands.

On the terminal and desktop app the card is drawn in the colors of your current pack, with a header box, swatches and the spinner word. Elsewhere, and for the model, you get the plain text above.

`/glowup config` asks five questions, plus two for color tweaks and three if you pick status line fields. See [config](#config).

An unknown subcommand prints `Unknown: <what you typed>` followed by the short card.

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

## spinner

| Command | What it does |
| --- | --- |
| `/glowup spinner <name>` | Use one spinner (`stock`, `comet`, `eyes`, `orb-states`, `clawd` or `shimmer`) on top of the current pack. Prints `Spinner: <name>`. An unknown name lists the valid ones. |
| `/glowup spinner list` | List the spinners. A filled dot marks the one showing now, whether it is your override or the pack's own. |
| `/glowup spinner default` | Drop the override and go back to the pack's spinner. Prints `Spinner: pack default`. |

`/glowup pack <name>` clears a spinner override, so choose the pack first and the spinner after.

The built-in packs are `classic` (the default), `crt`, `cozy` and `arcade`. If a pack cannot load, glowup prints the reason and keeps the current look. The file format, limits and every refusal message are in [Packs](packs.md).

## color

| Command | What it does |
| --- | --- |
| `/glowup color` or `/glowup color list` | List the 14 color roles with their current hex. A filled dot and `(override)` mark the ones you changed. |
| `/glowup color <role> <#hex>` | Override one role. The hex is `#rgb` or `#rrggbb`. Prints `Color <role>: #rrggbb`. |
| `/glowup color reset <role>` | Clear one override. |
| `/glowup color reset` | Clear all overrides. |

The roles are the ones in the [theme reference](theme-reference.md): `accent`, `text`, `dim`, `faint`, `read`, `edit`, `shell`, `agent`, `pass`, `fail`, `panel`, `addBg`, `delBg` and `sel`. An unknown role or a bad hex prints the reason and changes nothing.

An override is saved and applied on top of whatever pack and theme are active. It survives `/glowup pack <name>` and `/glowup theme <name>`, and `/glowup export konsole` and `/glowup pack save <name>` include it. A pack's own gradient, border color and spinner color stay as the pack set them. Overrides are not part of a pack file unless you save one.

## import

`/glowup import <file>` turns a Ghostty or base16 color scheme into a pack with a colors layer, saves it in `~/.claude/glowup/packs` and applies it. The file can be at most 64 KB. Add `--force` to replace an installed pack of the same name. See [Packs](packs.md#import-a-color-scheme).

## export

`/glowup export konsole` writes your current colors as a Konsole color scheme to `$XDG_DATA_HOME/konsole/glowup-<pack>.colorscheme` (`~/.local/share/konsole/` when `XDG_DATA_HOME` is not set), replacing an earlier export of the same name. Then in Konsole pick it under Settings → Edit Current Profile → Appearance.

## pet and bubbles

| Command | What it does |
| --- | --- |
| `/glowup pet clawd` | Show Clawd. Prints `Pet: clawd`. |
| `/glowup pet off` | Hide the pet. Prints `Pet: off`. |
| `/glowup pet list` | List the pets you can pick. A filled dot marks the current one. |
| `/glowup pet clawd-shiny` | The shiny Clawd. Prints `The shiny pet is not unlocked yet.` until you earn him. |
| `/glowup bubbles on` | Turn speech bubbles on. Prints `Bubbles: on`. |
| `/glowup bubbles off` | Turn them off. |
| `/glowup bubbles haiku` | Let Claude Haiku write some lines. Each one is a small call on your account. Prints `Bubbles: haiku`. |

See [Pets](pets.md).

## config

`/glowup config` asks five questions, two more if you pick "Tweak colors" and three more if you pick status line fields, in Claude Code's own question dialog. Each answer applies as soon as you give it:

1. **Pack**: `arcade`, `classic`, `cozy` or `crt`, with the one in use marked `(current)`. Choose Other and type the name of a pack you installed to use that one. An unknown name prints an error and stops the questions.
2. **Spinner**: `Pack default` (clears a spinner you set), then three spinners, leaving out the one your pack already uses. A spinner you set is marked `(current)`. Choose Other and type any spinner name from `/glowup spinner list`; an unknown name prints an error and stops the questions.
3. **Pet**: Clawd, the shiny Clawd once you have unlocked him, or no pet.
4. **Extras**: pick any of "Turn bubbles on/off", "Write bubbles with Haiku" (or "Use template bubbles" when Haiku is on) and "Turn reduced motion on/off". The labels flip the current setting. Picking none changes nothing.
   - **Tweak colors** asks **Color**: `accent`, `text`, `dim` or `panel`, or Other to type any role from `/glowup color list`. Then it asks **Hex**: a few colors from the current palette, or Other to type `#rgb` or `#rrggbb`. It sets the same override as `/glowup color <role> <#hex>`. An unknown role or a bad hex prints the reason and stops.
5. **Status line fields**: `Keep`, `Default` or `Pick`. Default does what `/glowup statusline fields default` does. Pick asks three more questions, each a multi-select: Session (`activity`, `ctx`, `agents`, `plan`), Account (`5h`, `week`, `cost`, `model`) and Repo (`branch`, `changes`, `cwd`). The fields apply in that order. Picking none, or exactly the current list, changes nothing, and Esc on any of the three applies no field change. If glowup is not drawing your status line, the question says the fields show in the entry under the prompt, and that `/glowup statusline on` draws the whole line.

Esc on any question stops there. Answers you already gave stay applied. The command ends with a one-line summary, for example `glowup · arcade · spinner comet · Clawd · bubbles on · full motion` (the spinner part appears only when you set one), drawn with the pack's colors.

Each answer does what the matching typed command does (`pack`, `spinner`, `pet`, `bubbles`, `motion`, `color`, `statusline fields`), so the questions add nothing the commands lack. The colors and motion layers on their own, and saving a look are not in the questions: use `/glowup pack save <name>` to save the current look. In a `-p` run there is no one to ask, so `/glowup config` prints the command list instead.

## Settings and the store

The mod's settings in Claude Code's `/plugin` menu (`pack`, `theme`, `spinner`, `pet`, `bubbles`, `statusline` and `reducedMotion`) and the `/glowup` commands change the same saved choices, and the last change wins. glowup remembers the `/plugin` values it saw last. When a value differs at the next session start or after `/reload-plugins`, glowup runs the matching command (`/glowup pack crt` for a new `pack`, and so on) and shows a toast naming what it applied. A `/glowup` command or the config questions replace that choice at once, and stay until you change that setting in `/plugin` again. If `/plugin` holds a value glowup cannot apply, such as an unknown pack, the toast says so and the value is not retried. Only `/glowup statusline fields default` clears a saved choice; for the other settings there is no such command.

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
| `/glowup statusline fields` | Show the status line fields. |
| `/glowup statusline fields <id> <id> …` | Set the fields in the order typed. An unknown id refuses the whole command and lists the valid ids. |
| `/glowup statusline fields default` | Go back to the `statusline` setting's value, `activity ctx 5h week` unless you changed it. |

The fields are `activity`, `ctx`, `5h`, `week`, `cost`, `model`, `agents`, `plan`, `branch`, `changes` and `cwd`. See [Choosing the fields](statusline.md#choosing-the-fields).

This is opt-in. Without it, glowup only adds its own entry under the prompt while Claude works. Restore puts your line back only if it is still glowup's. See [Status line](statusline.md).
