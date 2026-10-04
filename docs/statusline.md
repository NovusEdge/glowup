---
title: Status line
description: The status entry glowup adds by default, the opt-in takeover, what it writes to disk, and how to undo it.
order: 4
section: Use
---

## Two modes

By default glowup adds one entry under the prompt and leaves your own status line alone. If you want glowup to draw the whole status line, you opt in with `/glowup statusline on`.

| | Default | Takeover |
| --- | --- | --- |
| How to get it | Nothing to do | `/glowup statusline on` |
| Your `statusLine` setting | Untouched | Replaced, with a saved copy |
| Files glowup writes | None | A script and a status file per session |
| How to undo | Not needed | `/glowup statusline restore` |

## The default entry

glowup shows an entry such as:

```text title="status entry"
◆ editing · ctx 48%
```

It has a state word and the context used. The word is one of `thinking`, `reading`, `searching`, `editing`, `running`, `delegating`, `failing`, `passing`, `waiting` or `idle`. The entry is hidden while Claude is idle and context is empty. It sits beside whatever status line you already have.

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

Run `/glowup statusline restore`. glowup puts the saved `statusLine` value back in `settings.json`, or removes the key if you had none, and deletes the script. It prints `Your status line is back.` If glowup never replaced your status line, it prints `Nothing to restore: glowup never replaced your status line.`

## Project settings win

A project or local settings file can set its own `statusLine`. That setting beats the one in your user settings, so glowup's status line does not show in that project.

When glowup finds one, the confirmation question and the result both say so. The takeover still edits your user settings. To see glowup's line in that project, remove `statusLine` from the project's `.claude/settings.json` or `.claude/settings.local.json`.
