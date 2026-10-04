---
title: Install
description: Install the glowup mod from its marketplace, check that it loads, and remove it.
order: 1
section: Start
---

## Install

glowup is a Claude Code mod. You need Claude Code 2.1.288 or later. In Claude Code, run:

```text title="claude code"
/plugin marketplace add NovusEdge/glowup
/plugin install glowup@glowup
```

The mod loads in your current session. If it does not, restart Claude Code.

## Check that it works

Run `/glowup` with no arguments. It prints the usage text. Then start a turn. While Claude works you see a one-line band above the prompt. In fullscreen on a wide terminal you also see the glowup pane beside the transcript.

If you see neither, read [Layout](layout.md) for the width rules.

## Settings

The mod has two settings. You can change them when you enable the mod, or in your Claude Code settings.

| Setting | Values | Default | What it does |
| --- | --- | --- | --- |
| `theme` | A theme name | `classic` | The theme at session start. |
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

If you ran `/glowup statusline on`, run `/glowup statusline restore` first. It puts your own status line back. See [Status line](statusline.md).

Then remove the mod:

```text title="claude code"
/plugin uninstall glowup@glowup
```

Theme files you added stay in `~/.claude/glowup/themes`. Delete the folder if you do not want them.
