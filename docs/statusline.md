---
title: Status line
description: The status entry glowup shows while Claude works, the opt-in takeover, what it writes to disk, and how to undo it.
---

glowup can show status in two ways. By default it adds a single entry under the prompt while Claude is working and leaves your own status line alone. If you opt in, it takes over the whole status line instead, which means replacing your `statusLine` setting (glowup keeps a copy) and writing a small script and a status file per session. `/glowup statusline restore` undoes the takeover.

## The first-run question

The first time you start an interactive session after installing glowup, it asks once whether it should draw your status line. This is the same question `/glowup statusline on` asks: it names the settings file it would change and warns you if a project sets its own status line. Yes runs the takeover described below. No changes nothing, and glowup does not ask again.

If you close the question without answering, glowup asks again on the next start, up to three times in all. It never asks in `-p` or SDK runs, or when it cannot read `settings.json`.

## The default entry

While Claude or a subagent is working, the entry under the prompt looks like this:

```text title="status entry"
◆ editing · ctx 48% · 5h 23% ↻2h10m · wk 61% ↻Thu
```

It shows what Claude is doing, how much of the context window is used, and your 5-hour and weekly usage with their reset times, and you can [choose different fields](#choosing-the-fields). It stays up while background subagents run after the turn ends, and disappears when everything is idle. With the takeover on, the entry is not shown, since the status line carries the same information.

Claude Code puts a `⚠ glowup:` prefix in front of every mod's status entry. It does not mean anything is wrong.

## Choosing the fields

The entry and the takeover line both show the same list of fields, in the order you pick. The default is `activity ctx 5h week`.

| Id | Shows |
| --- | --- |
| `activity` | what Claude is doing: `◆ editing` |
| `ctx` | context used: `ctx 48%` |
| `5h` | 5-hour usage and reset: `5h 23% ↻2h10m` |
| `week` | weekly usage and reset: `wk 61% ↻Thu` |
| `cost` | session cost: `$1.24` |
| `model` | the model, as `/model` names it |
| `agents` | running subagents: `2 agents` |
| `plan` | plan progress: `plan 3/7` |
| `branch` | git branch |
| `changes` | lines added and removed: `+42 −7` |
| `cwd` | the project folder name |

List the fields you want in order, or go back to the default:

```text title="claude code"
/glowup statusline fields activity 5h week branch
/glowup statusline fields default
```

An unknown id rejects the whole command and lists the valid ones. `/glowup config` also offers the fields as three groups of checkboxes, and the `statusline` setting in the `/plugin` menu accepts them comma-separated.

A field with nothing to show is left out rather than shown as zero; `5h` and `week` only appear on a subscription that reports those limits. The usage numbers are the latest Claude Code gave this session, so usage from another session on the same account shows up here after your next response.

In the takeover line, percentages are drawn in your theme's pass color, switching to its edit color at 50% and its fail color at 80%. It uses 24-bit color when `COLORTERM` is `truecolor` or `24bit` and 256 colors otherwise. The entry under the prompt is plain text.

## The takeover

`/glowup statusline on` asks for confirmation first. If you say Yes, glowup:

1. Saves your current `statusLine` value (or the fact that you had none).
2. Writes a small shell script to `~/.claude/glowup/statusline.sh`.
3. Points `statusLine` in `~/.claude/settings.json` at that script. It re-reads the file just before writing and changes only that key.
4. From then on, writes the line to show to `~/.claude/glowup/status/<session id>` whenever it changes, and at least once a minute.

The script reads the session id from the JSON Claude Code passes it and prints that session's file. With `CLAUDE_CONFIG_DIR` set, all of these paths are under that folder instead of `~/.claude`. If `settings.json` exists but is not valid JSON, glowup says so and changes nothing.

### If glowup is gone

The script only uses a status file that is less than 10 minutes old; otherwise it runs your original status line command. So if you uninstall or disable glowup without restoring, your own status line returns within 10 minutes (or the line stays blank if you had none).

## Restore

`/glowup statusline restore` puts your saved `statusLine` back, or removes the key if you had none, and deletes glowup's script and status files. If you changed `statusLine` yourself after the takeover, restore leaves your value alone and just discards the backup.

## Project settings

A `statusLine` in a project's `.claude/settings.json` or `.claude/settings.local.json` overrides your user settings, so glowup's line will not show in that project. The confirmation question warns you when it finds one; remove the project's `statusLine` to see glowup's line there.
