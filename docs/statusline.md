---
title: Status line
description: The status entry glowup shows while Claude works, the opt-in takeover, what it writes to disk, and how to undo it.
---

## Two modes

Without the takeover, glowup adds one entry under the prompt while Claude is working and leaves your own status line alone. If you want glowup to draw the whole status line, you opt in with `/glowup statusline on`, or by saying Yes to the [first-run question](#the-first-run-question).

| | Default | Takeover |
| --- | --- | --- |
| How to get it | Nothing to do | `/glowup statusline on` |
| Your `statusLine` setting | Untouched | Replaced, with a saved copy |
| Files glowup writes | None | A script and a status file per session |
| How to undo | Not needed | `/glowup statusline restore` |

## The first-run question

The first time you start an interactive session after installing glowup, it waits about a second and a half and asks once whether it should draw your status line. The question is the same one `/glowup statusline on` asks. It names your settings file and warns you if a project sets its own status line.

- **Yes** runs the takeover described below, with a backup.
- **No**, or any text you type under "Other", changes nothing. glowup shows a notice that names `/glowup statusline on`.

Your answer is saved and glowup does not ask again.

If you close the question without answering, glowup asks again on the next interactive start, up to three times in all. After the third, it stops asking. Answer it yourself at any time:

```text title="claude code"
/glowup statusline on
/glowup statusline restore
```

glowup does not ask in non-interactive runs (`-p`) or SDK runs. If `settings.json` cannot be read, it does not ask and does not count that start as a try. If you upgraded from 0.1 with the takeover already on, it counts as answered.

## The default entry

glowup shows an entry such as:

```text title="status entry"
◆ editing · ctx 48%
```

By default it has a state word and the context used, then your 5-hour and weekly usage when Claude Code reports them. You can [choose the fields](#choosing-the-fields). The word is one of `thinking`, `reading`, `searching`, `editing`, `running`, `delegating`, `failing`, `passing` or `waiting`. The entry shows only while Claude or a subagent is working, including background subagents that keep running after the main turn ends (the word is then `delegating`). glowup clears it when everything is idle, and never shows it while the takeover is on, because the takeover line says the same thing.

Claude Code draws the entry with a `⚠ glowup:` prefix. That is Claude Code's own styling for mod status entries. It is not a warning.

## Choosing the fields

The line is a list of fields, joined with a dim ` · `, in the order you pick. The default is `activity ctx 5h week`. The same list drives the default entry and the takeover line.

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

Set them with a command:

```text title="claude code"
/glowup statusline fields
/glowup statusline fields activity 5h week branch
/glowup statusline fields default
```

- `fields` alone shows the current list.
- `fields <id> <id> …` sets the list in the order you type it. An unknown id refuses the whole command and lists the valid ids. A repeated id keeps its first place.
- `fields default` goes back to the `statusline` setting's value, which is `activity ctx 5h week` unless you changed that setting.

`/glowup config` asks "Status line fields?" after its other questions, with Keep, Default and Pick. Pick asks three multi-select questions: Session (`activity`, `ctx`, `agents`, `plan`), Account (`5h`, `week`, `cost`, `model`) and Repo (`branch`, `changes`, `cwd`). The `statusline` setting in Claude Code's `/plugin` menu takes the starting list as comma-separated ids.

A field with no data is left out, not shown as zero. `5h` and `week` appear only on a subscription that reports those windows. The usage figures are this session's last reading from Claude Code, so another session on the same account moves the real numbers and this line catches up on your next response here. A window whose reset time has passed is hidden.

Colors come from your theme. The percentages in `ctx`, `5h` and `week` use the pass color below 50%, the edit color from 50% and the fail color from 80%. glowup writes 24-bit color when `COLORTERM` is `truecolor` or `24bit`, and 256 colors otherwise. Without the takeover, the entry under the prompt is plain text and shows only while Claude works.

## The takeover

Run `/glowup statusline on`. glowup asks a Yes or No question first. No, or closing the dialog, changes nothing.

On Yes, glowup does four things:

1. It saves your current `statusLine` value in the mod's store. If you had none, it saves a note that you had none.
2. It writes a small shell script to `~/.claude/glowup/statusline.sh`.
3. It sets `statusLine` in `~/.claude/settings.json` to `sh ~/.claude/glowup/statusline.sh`. It re-reads the file just before writing and changes only that one key, so other settings stay as they are.
4. While the takeover is on, it writes the line it wants shown to `~/.claude/glowup/status/<session id>`. It writes when the line changes, and once a minute so a quiet session stays fresh.

If `CLAUDE_CONFIG_DIR` is set, glowup uses that folder instead of `~/.claude` for every path above.

Claude Code runs the script for each status line draw and passes it JSON on stdin. The script reads the `session_id` from that JSON and prints the matching status file.

### If glowup is gone

The script prints the status file only when the file exists and is less than 10 minutes old. Otherwise it runs your original status line command with the same input. If you uninstall glowup or turn it off without restoring, your own status line comes back within 10 minutes. If you had no status line, the line is blank.

### If glowup cannot read your settings

If `settings.json` exists but does not parse as a JSON object, glowup says so and changes nothing.

## Restore

Run `/glowup statusline restore`. If the current `statusLine` is still glowup's, glowup puts the saved value back in `settings.json`, or removes the key if you had none. It prints `Your status line is back.`

If you changed `statusLine` since the takeover, glowup leaves your setting alone, forgets the backup, and prints `Your status line was changed since; left it as is.`

Either way, restore deletes glowup's script and status files. If glowup never replaced your status line, it prints `Nothing to restore: glowup never replaced your status line.`

All of these paths follow `CLAUDE_CONFIG_DIR`, and default to `~/.claude`.

## Project settings win

A project or local settings file can set its own `statusLine`. That setting beats the one in your user settings, so glowup's status line does not show in that project.

When glowup finds one, the confirmation question and the result both say so. The takeover still edits your user settings. To see glowup's line in that project, remove `statusLine` from the project's `.claude/settings.json` or `.claude/settings.local.json`.
