---
title: Commands
description: Every /glowup subcommand, what it prints, and when it fails.
---

## The /glowup command

`/glowup` with no arguments, or with `help`, prints a card with the five commands most people need:

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

In the terminal and the desktop app, the card is drawn in your pack's colors with a header box, color swatches and the spinner word; the model, and any other client, sees the plain text above. An unknown subcommand prints `Unknown: <what you typed>` above the card.

Look, pet, motion and status line choices are saved and carry over to later sessions.

## theme

| Command | What it does |
| --- | --- |
| `/glowup theme <name>` | Switch to a theme. Prints `Theme: <name>`. |
| `/glowup theme default` | Drop the theme and go back to the current pack's own colors. Prints `Theme: pack default`. |
| `/glowup theme list` | List the built-in themes and your own. The active theme has a filled dot, including one chosen in the settings menu. |
| `/glowup theme add <url>` | Download a theme file, check it, and install it. |

A theme replaces the current [pack](packs.md)'s palette and keeps its row style, border and extras. If the theme fails to load, glowup prints why and stays on the current one. The built-in themes are `classic` (the default), `glowup`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` and `high-contrast`; your own are read from `~/.claude/glowup/themes`. See [Making a theme](themes.md).

### theme add

`theme add` takes an `https://` URL to a single JSON file. It then:

1. Refuses anything that is not `https://`.
2. Downloads the file. A download over 64 KB is refused.
3. Reads the `name` field. The name must be lowercase letters, digits and dashes, start with a letter or digit, and be at most 40 characters.
4. Refuses a name that is one of the built-in themes.
5. Checks the whole file, including the `extends` chain, against the [theme reference](theme-reference.md).
6. Saves it as `<name>.json` in `~/.claude/glowup/themes`.

Each refusal prints a message naming the failed check. Adding a theme whose name you already have silently replaces your file. `theme add` installs without switching, so follow it with `/glowup theme <name>`.

## pack

| Command | What it does |
| --- | --- |
| `/glowup pack <name>` | Apply a pack to both layers. Prints `Pack: <name>`. |
| `/glowup pack list` | List built-in and installed packs. A filled dot marks the active one. If the look is a mix of packs or has a theme or spinner on top, a last line starts `custom mix:` and names each layer. |
| `/glowup pack save <name>` | Save the current look as a self-contained pack file in `~/.claude/glowup/packs`. Prints `Saved pack "<name>" to <path>.` |
| `/glowup pack <url>` | Download, check and install a pack from an `https://` URL, then apply it. |
| `/glowup pack <url> --force` | The same, replacing an installed pack of that name. |
| `/glowup pack <studio link>` | Install the look in a link from the [studio](https://glowup.khimani.dev/studio). Nothing is downloaded: the pack is inside the link. If the link also carries a setup, glowup asks before applying it. Add `--force` to replace an installed pack of the same name. |

## spinner

| Command | What it does |
| --- | --- |
| `/glowup spinner <name>` | Use one spinner (`stock`, `comet`, `eyes`, `orb-states`, `clawd` or `shimmer`) on top of the current pack. Prints `Spinner: <name>`. An unknown name lists the valid ones. |
| `/glowup spinner list` | List the spinners. A filled dot marks the one showing now, whether it is your override or the pack's own. |
| `/glowup spinner default` | Drop the override and go back to the pack's spinner. Prints `Spinner: pack default`. |

`/glowup pack <name>` clears a spinner override, so choose the pack first and the spinner after.

The built-in packs are `classic` (the default), `crt`, `cozy` and `arcade`. If a pack fails to load, glowup prints why and keeps the current look. The file format and limits are in [Packs](packs.md).

## color

| Command | What it does |
| --- | --- |
| `/glowup color` or `/glowup color list` | List the 14 color roles with their current hex. A filled dot and `(override)` mark the ones you changed. |
| `/glowup color <role> <#hex>` | Override one role. The hex is `#rgb` or `#rrggbb`. Prints `Color <role>: #rrggbb`. |
| `/glowup color reset <role>` | Clear one override. |
| `/glowup color reset` | Clear all overrides. |

The roles are the ones in the [theme reference](theme-reference.md): `accent`, `text`, `dim`, `faint`, `read`, `edit`, `shell`, `agent`, `pass`, `fail`, `panel`, `addBg`, `delBg` and `sel`. An unknown role or a bad hex prints the reason and changes nothing.

An override sits on top of whatever pack and theme are active and survives switching either. `/glowup export konsole` and `/glowup pack save <name>` include it. It does not touch a pack's gradient, border color or spinner color.

## import

`/glowup import <file>` turns a Ghostty or base16 color scheme into a pack with a colors layer, saves it in `~/.claude/glowup/packs` and applies it. The file can be at most 64 KB. Add `--force` to replace an installed pack of the same name. See [Packs](packs.md#making-your-own).

## export

`/glowup export konsole` writes your current colors as a Konsole color scheme to `$XDG_DATA_HOME/konsole/glowup-<pack>.colorscheme` (`~/.local/share/konsole/` when `XDG_DATA_HOME` is not set), replacing an earlier export of the same name. In Konsole it appears under Settings → Edit Current Profile → Appearance.

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

## setup

Your layout and behavior settings. They are yours alone: installing someone's pack never changes them.

| Command | What it does |
| --- | --- |
| `/glowup setup` | Print every setting with its value. |
| `/glowup setup <key> <value>` | Change one setting and print them all. |
| `/glowup setup reset` | Go back to the defaults. |

| Key | Value | Default |
| --- | --- | --- |
| `band` | Comma list of `combo`, `agents`, `meter`, `plan`, or `none`. The order is the order in the band. | `combo,agents,meter,plan` |
| `tabs` | Comma list of `changes`, `agents`, `plan`; at least one. | `changes,agents,plan` |
| `meter.warn` | Percent at which context and usage turn the `edit` color. | `50` |
| `meter.danger` | Percent at which they turn `fail`, the pane warns and the pet pants. | `80` |
| `bubbles.moods` | Comma list of `needs-you`, `fail`, `done`, or `none`. | all three |
| `bubbles.ms` | How long a bubble stays, 1500 to 10000. | `3000` |
| `pet.sleepMs` | Idle time before the pet sleeps, 15000 to 600000. | `60000` |

## config

`/glowup config` asks five questions, two more if you pick "Tweak colors" and three more if you pick status line fields, in Claude Code's own question dialog. Each answer applies as soon as you give it:

1. **Pack**: `arcade`, `classic`, `cozy` or `crt`, with the one in use marked `(current)`. Choose Other and type the name of a pack you installed to use that one. An unknown name prints an error and stops the questions.
2. **Spinner**: `Pack default` (clears a spinner you set), then three spinners, leaving out the one your pack already uses. A spinner you set is marked `(current)`. Choose Other and type any spinner name from `/glowup spinner list`; an unknown name prints an error and stops the questions.
3. **Pet**: Clawd, the shiny Clawd once you have unlocked him, or no pet.
4. **Extras**: pick any of "Turn bubbles on/off", "Write bubbles with Haiku" (or "Use template bubbles" when Haiku is on) and "Turn reduced motion on/off". The labels flip the current setting. Picking none changes nothing.
   - **Tweak colors** asks **Color**: `accent`, `text`, `dim` or `panel`, or Other to type any role from `/glowup color list`. Then it asks **Hex**: a few colors from the current palette, or Other to type `#rgb` or `#rrggbb`. It sets the same override as `/glowup color <role> <#hex>`. An unknown role or a bad hex prints the reason and stops.
5. **Status line fields**: `Keep`, `Default` or `Pick`. Default does what `/glowup statusline fields default` does. Pick asks three more questions, each a multi-select: Session (`activity`, `ctx`, `agents`, `plan`), Account (`5h`, `week`, `cost`, `model`) and Repo (`branch`, `changes`, `cwd`). The fields apply in that order. Picking none, or exactly the current list, changes nothing, and Esc on any of the three applies no field change. If glowup is not drawing your status line, the question says the fields show in the entry under the prompt, and that `/glowup statusline on` draws the whole line.

Esc on any question stops there, keeping the answers already given. The command ends with a card: the same header box as `/glowup help` in the pack's border and colors, then **You picked** (pack, spinner, pet, extras and status line) and **Try next** (three commands and the docs link). The card keeps the pack it was drawn with when it scrolls into history. Where it cannot draw, such as a `-p` run, the same content prints as plain text, starting with a line like `glowup · arcade · spinner comet · Clawd · bubbles on · full motion`.

Each answer has the same effect as the matching command (`pack`, `spinner`, `pet`, `bubbles`, `motion`, `color`, `statusline fields`). Mixing layers from different packs and saving a pack are only available as commands. In a `-p` run, `/glowup config` prints the command list instead of asking.

## Settings and the store

The mod's settings in Claude Code's `/plugin` menu (`pack`, `theme`, `spinner`, `pet`, `bubbles`, `statusline` and `reducedMotion`) and the `/glowup` commands change the same saved choices, and the most recent change is the one in effect.

glowup remembers the `/plugin` values it last saw. If one differs at the next session start or after `/reload-plugins`, glowup runs the matching command (`/glowup pack crt` for a new `pack`, and so on) and shows a toast saying what it applied. A value it cannot apply, such as an unknown pack name, gets a toast and is not retried. When `pack` changes, glowup puts the `/plugin` theme and spinner back on top of the new pack.

Setting `theme` back to `classic`, `spinner` to `pack` or `statusline` to its default list clears the saved choice, as `/glowup theme default`, `/glowup spinner default` and `/glowup statusline fields default` do, rather than saving the default value.

## pane

`/glowup pane` toggles the pane, or prints why it cannot open when there is no room. Esc also closes a pane opened this way. Where it opens depends on terminal width; see [Layout](layout.md).

## motion

| Command | What it does |
| --- | --- |
| `/glowup motion reduced` | Turn glowup's animation off. |
| `/glowup motion full` | Turn it back on. |

See [Accessibility](accessibility.md) for what reduced motion changes.

## statusline

| Command | What it does |
| --- | --- |
| `/glowup statusline on` | Ask for confirmation, then let glowup draw your status line. |
| `/glowup statusline restore` | Put your own status line back. |
| `/glowup statusline fields` | Show the status line fields. |
| `/glowup statusline fields <id> <id> …` | Set the fields in the order typed. An unknown id refuses the whole command and lists the valid ids. |
| `/glowup statusline fields default` | Go back to the `statusline` setting's value, `activity ctx 5h week` unless you changed it. |

The fields are `activity`, `ctx`, `5h`, `week`, `cost`, `model`, `agents`, `plan`, `branch`, `changes` and `cwd`. See [Choosing the fields](statusline.md#choosing-the-fields).

Without `statusline on`, glowup only adds its own entry under the prompt while Claude works. `restore` puts your line back only if the current one is still glowup's. See [Status line](statusline.md).
