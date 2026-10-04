---
title: Install
description: Install the glowup mod from its marketplace, check that it loads, and remove it.
order: 1
section: Start
---

## Install

glowup is a Claude Code mod. You need Claude Code 2.1.289 or later. In a terminal, run:

```sh title="shell"
curl -fsSL https://glowup.khimani.dev/install.sh | sh
```

The script downloads the glowup installer for your machine from the latest GitHub release, checks it against the release's `checksums.txt`, and runs it once from a temp folder. Nothing goes on your PATH and nothing needs sudo. To read the script first:

```sh title="shell"
curl -fsSL https://glowup.khimani.dev/install.sh | less
```

The installer shows a preview while you pick a pack, a pet, speech bubbles and reduced motion. Then it runs `claude plugin marketplace add NovusEdge/glowup` and `claude plugin install glowup@glowup` with your choices. If glowup is already installed, it updates the settings you pick instead, and leaves your theme alone. With `--yes` on an installed glowup, only the options you pass change; with none, nothing changes. Restart Claude Code if it is running, then type `/glowup`.

The script runs on Linux and macOS, on x86-64 and ARM. On Windows, download `glowup-installer_<version>_windows_amd64.zip` from the [latest release](https://github.com/NovusEdge/glowup/releases/latest), or install by hand.

### Installer options

Pass options after `sh -s --`:

```sh title="shell"
curl -fsSL https://glowup.khimani.dev/install.sh | sh -s -- --yes --pack crt
```

| Option | What it does |
| --- | --- |
| `--yes` | Install without the picker, with the defaults or the options below. The script adds it when there is no terminal. |
| `--pack NAME` | `classic`, `crt`, `cozy` or `arcade`. Default `classic`. |
| `--pet clawd\|off` | Default `clawd`. |
| `--bubbles on\|off` | Speech bubbles. Default `on`. |
| `--reduced-motion` | Turn off glowup's animation. |
| `--dry-run` | Print the commands a fresh install runs, and run nothing. |
| `--version` | Print the installer's version. |

Set `GLOWUP_VERSION=v0.3.0` to use that release's installer instead of the latest.

### Install by hand

In Claude Code, run:

```text title="claude code"
/plugin marketplace add NovusEdge/glowup
/plugin install glowup@glowup
```

The mod loads in your current session. If it does not, restart Claude Code.

## Check that it works

Run `/glowup` with no arguments. It prints the usage text. Then start a turn. While Claude works you see a one-line band above the prompt. In fullscreen on a wide terminal you also see the glowup pane beside the transcript.

If you see neither, read [Layout](layout.md) for the width rules.

## Settings

The mod has five settings. The installer sets them. You can change them later with `claude plugin configure glowup@glowup`, or in your Claude Code settings.

| Setting | Values | Default | What it does |
| --- | --- | --- | --- |
| `pack` | A pack name | `classic` | The pack at session start. |
| `pet` | `clawd` or `off` | `clawd` | Shows Clawd, or no pet. |
| `bubbles` | `on` or `off` | `on` | Turns speech bubbles on or off. |
| `theme` | A theme name | `classic` | A theme on top of the pack. `classic` keeps the pack's own colors. |
| `reducedMotion` | `true` or `false` | `false` | Turns off glowup's animation. |

`/glowup theme <name>` and `/glowup motion` save your choice in the mod's store. A saved choice wins over the setting. See [Commands](commands.md).

## Run from a clone

To try a change to the mod, run it from a checkout:

```sh title="shell"
git clone https://github.com/NovusEdge/glowup
cd glowup
claude --plugin-dir .
```

The session watches the folder and reloads the mod when you save a file.

## Remove

If you ran `/glowup statusline on`, run `/glowup statusline restore` first. It puts your own status line back, unless you changed it since. See [Status line](statusline.md).

Then remove the mod:

```text title="claude code"
/plugin uninstall glowup@glowup
```

Theme files you added stay in `~/.claude/glowup/themes`. Delete the folder if you do not want them.
