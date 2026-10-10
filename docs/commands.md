---
title: Commands
description: Every /glowup subcommand, what it prints, and when it fails.
---

## The /glowup command

`/glowup` with no arguments, or with `help`, prints a card with the five commands most people need:

```text title="claude code"
glowup

  /glowup config                       open the config TUI in a new terminal window
  /glowup pack <name>                  switch look: arcade classic cozy crt
  /glowup pet clawd|robot|off          pick a pet, or none
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
| `/glowup pack <studio link>` | Install the look in a link from the [studio](https://glowup.khimani.dev/studio). Nothing is downloaded: the pack is inside the link. If the link also carries a setup, glowup asks before applying it. Add `--force` to replace an installed pack of the same name. If the link carries a pet, glowup installs it and switches to it, unlike `/glowup pet add`, which only installs. A pet you already have needs `--force` too. |

## spinner

| Command | What it does |
| --- | --- |
| `/glowup spinner <name>` | Use one spinner (`stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer`, `scanline`, `ring`, `glitch` or `signal`) on top of the current pack. Prints `Spinner: <name>`. An unknown name lists the valid ones. |
| `/glowup spinner list` | List the spinners. A filled dot marks the one showing now, whether it is your override or the pack's own. |
| `/glowup spinner default` | Drop the override and go back to the pack's spinner. Prints `Spinner: pack default`. |

`/glowup pack <name>` clears a spinner override, so choose the pack first and the spinner after.

The built-in packs are `classic` (the default), `crt`, `cozy` and `arcade`. If a pack fails to load, glowup prints why and keeps the current look. The file format and limits are in [Packs](packs.md).

## color

| Command | What it does |
| --- | --- |
| `/glowup color` or `/glowup color list` | List the 14 color roles with a swatch, their current hex and what each one paints. A filled dot and `(override)` mark the ones you changed. |
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
| `/glowup pet robot` | Show the CRT robot. Prints `Pet: robot`. |
| `/glowup pet <name>` | Show a pet you installed. Prints `Pet: <name>`. An unknown name prints `No pet named "<name>". /glowup pet list shows the pets you have.` and changes nothing. |
| `/glowup pet add <file\|https url> [--force]` | Install a pet file from the [studio](https://glowup.khimani.dev/studio) or your disk, without switching to it. Prints `Installed pet "<name>". Switch to it with /glowup pet <name>`. `--force` replaces an installed pet of the same name. |
| `/glowup pet off` | Hide the pet. Prints `Pet: off`. |
| `/glowup pet list` | List the built-in pets, then the ones you installed, then `off`. A filled dot marks the current one. |
| `/glowup pet clawd-shiny` | The shiny Clawd. Prints `The shiny pet is not unlocked yet.` until you earn him. |
| `/glowup pet egg` | The secret egg. Prints `The egg is not unlocked yet.` until you find the code. |
| `/glowup bubbles on` | Turn speech bubbles on. Prints `Bubbles: on`. |
| `/glowup bubbles off` | Turn them off. |
| `/glowup bubbles haiku` | Let Claude Haiku write some lines. Each one is a small call on your account. Prints `Bubbles: haiku`. |
| `/glowup level` | Print your level, your XP total, the XP to the next level, the unlocks you have earned and the next one. Outfit and move unlocks are marked coming soon until they ship. Once you have every unlock it prints `All unlocks earned.` in place of the next one. |

See [Pets](pets.md), and [Pet sprites](pet-sprites.md) for drawing your own.

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
| `tabs` | Comma list of `plan`, `agents`, `diff`, `changes`; at least one. The first one is the tab the pane opens on. | `plan,agents,diff,changes` |
| `meter.warn` | Percent at which the status line's percentages turn the `edit` color. | `50` |
| `meter.danger` | Percent at which the status line's percentages turn `fail`, the pane warns about context and the pet pants. | `80` |
| `bubbles.moods` | Comma list of `needs-you`, `fail`, `done`, `green`, `hello`, `long-done`, `compact`, `level-up`, or `none`. | all eight |
| `bubbles.ms` | How long a bubble stays, 1500 to 10000. | `3000` |
| `pet.sleepMs` | Idle time before the pet sleeps, 15000 to 600000. | `60000` |

## config

`/glowup config` opens glowup's settings screen in a new terminal window. On Windows that is a new window in your default terminal app; WSL behaves as Linux. Changes apply to the session you ran it in as you make them. `q` keeps them, and Esc puts back what you had when the screen opened. In the desktop Code tab, where there is no terminal to open, `/glowup config` opens the pane described below instead, and `/glowup config pane` opens that pane anywhere.

The window opens in the first of these that applies:

1. Inside tmux, a new tmux window.
2. The terminal named by `$TERMINAL`, if you set it. Setting `$TERMINAL` is how you pick the terminal. glowup knows the argument conventions of konsole, kitty, ghostty, wezterm, gnome-terminal, foot, alacritty, xfce4-terminal, mate-terminal and terminator, and runs any other terminal as `<terminal> -e <command>`.
3. The terminal you are in, when glowup recognizes it: Konsole, kitty, Ghostty, WezTerm or GNOME Terminal.
4. Your system's default terminal: `xdg-terminal-exec`, then `x-terminal-emulator`.

On macOS the first rule applies too, tmux first. Otherwise it is Ghostty, iTerm, kitty or WezTerm, matching the terminal you are in, and Terminal.app for anything else. Without a display, as over SSH, nothing can open; glowup prints the command to run in a terminal instead, and it prints the same command if the window fails to start.

glowup runs the `glowup-installer` for the installed version. It looks first at the path in `GLOWUP_BIN`, then at `installer/glowup-installer` in a clone, and otherwise downloads the release's copy; see [Install](install.md#the-config-tui-binary). While the screen is open, `/glowup config` in that session says so instead of opening a second one.

### The config pane

The pane has a row for each choice, a preview of the look under them, and Done, Copy studio link and Reset at the bottom. Up and down move between rows.

The rows are Pack, Spinner, one for each color role, Band, Tabs, Meter, Pet, Sleeps, Bubbles, Bubble, Moods, Motion and Status. A row shown as ‹ value › cycles to its next value when you press Enter and applies it at once. The other rows are fields you type into and submit with Enter. A field you have not edited does nothing on Enter.

A color field takes a hex such as `#8ecbff` or `8ecbff`, and an empty one clears that role's override. Band, Tabs, Moods and Status take a list separated by commas or spaces, and the order you type is the order glowup draws them. An empty Band or Moods field means none, an empty Status field means the default fields, and Tabs needs at least one. The pane says what it did, or why it refused, on the line under the buttons.

Done, or Esc, closes the pane. Copy studio link puts a link to the studio on the clipboard, and the pane says so when the copy fails, as on a surface with no clipboard. Reset asks first, then clears your color overrides and your setup.

Each row has the same effect as the matching command (`pack`, `spinner`, `color`, `setup`, `pet`, `bubbles`, `motion`, `statusline fields`). Mixing layers from different packs and saving a pack are only available as commands. In a `-p` run, `/glowup config` prints the command list instead of opening the screen or the pane.

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
| `/glowup statusline fields default` | Go back to the `statusline` setting's value, `activity ctx effort 5h week` unless you changed it. |

The fields are `activity`, `ctx`, `5h`, `week`, `cost`, `model`, `effort`, `agents`, `plan`, `branch`, `changes`, `cwd` and `level`. See [Choosing the fields](statusline.md#choosing-the-fields).

Without `statusline on`, glowup only adds its own entry under the prompt while Claude works. `restore` puts your line back only if the current one is still glowup's. See [Status line](statusline.md).
