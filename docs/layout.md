---
title: Layout
description: The three width tiers, where the pane and band appear in each, and what each tab shows.
order: 3
section: Use
---

## Three tiers

glowup picks a layout from your terminal width. Your transcript and prompt never move.

| Tier | When | What you see |
| --- | --- | --- |
| Wide | The glowup pane is docked beside the transcript | The full pane, with Clawd at the bottom. No band, because the pane shows the same things. |
| Medium | 80 columns or more, and the pane is not docked | The one-line band above the prompt. The pane is a drawer you open on request. |
| Compact | Under 80 columns | The band, cut to fit. The drawer is a small one with a tab strip and at most six rows. |

### When the pane docks

In fullscreen, glowup asks Claude Code to open its pane once. Claude Code docks a pane nobody asked for only at 144 columns or more. Once you have opened the pane yourself, it docks from 110 columns. Below that, the pane waits and the band shows instead.

![The glowup pane docked beside the transcript](assets/pane-wide.png)

### Where Clawd is

Clawd, the [pet](pets.md), lives only at the bottom of the glowup pane. The band never shows him.

- Wide: the full Clawd, about 24 columns by 6 rows, at the bottom of the docked pane, with his speech bubble.
- Medium: the full Clawd at the bottom of the drawer, once you open it with `/glowup pane`. The pane's width decides, not the terminal's: the full Clawd shows in a drawer 80 columns wide or more.
- Compact: a one-row Clawd, `▐▛█▜▌`, at the bottom of the drawer.

Without the pane, you do not see him. Reduced motion or `/glowup pet off` hides him in every tier.

Claude Code's own task list stays where Claude Code draws it; a mod cannot hide it. The Plan & context tab shows the same list.

### The drawer

Run `/glowup pane` to open the pane as a drawer above the prompt. Esc closes it. Run the command again to close it too. The drawer never opens on its own below the docking width.

A drawer narrower than 80 columns uses the compact form of each tab.

![The compact drawer in a narrow terminal](assets/compact.png)

## The band

The band is one line above the prompt. It shows while Claude works and stays for 1.5 seconds after the turn ends, then folds away. It also stays up while background subagents run after the main turn ends, with the action shown as `delegating`. When a turn ends, the action reads `✓ Done`, `■ Interrupted` if you interrupted it, or `✗ Stopped` after an error or a refusal. It shows, left to right:

- The current action with its glyph and color, for example `✎ Editing auth.ts`. Failures show in the `fail` color and passes in the `pass` color.
- The number of running subagents, for example `◆ 2 subagents`.
- Five hearts for the context you have left. Each heart is 20% of the window. The hearts empty as context fills.
- Plan progress as pips, `●●○○`, when Claude has a task list.
- With a pack that turns them on, an HP bar in place of the hearts and a `COMBO x3` tag. See [Packs](packs.md#row-styles).

When the line is too long, the action is cut short first. If the rest of the line would leave the action fewer than 8 columns, the band drops everything but the action.

The band hides while the feedback survey shows, and while you view a subagent's transcript.

![The band above the prompt](assets/band.png)

## The tabs

The pane has three tabs. Press the number key, or click the tab. In the wide pane, a bordered box under the tabs shows the current action, the context hearts and the running subagents.

### Changes

Every file Claude touched this session.

- Edited files show `+added −removed`. A file Claude only read shows `read`, dimmed.
- New files are marked `new`.
- The header counts edited files and total added and removed lines.
- In a git repository the counts come from `git diff --numstat` against a snapshot taken at session start, which includes any uncommitted work at that moment. Files that were already modified before the session do not appear. Files changed by shell commands during the session do. New untracked files, and sessions outside git, use the counts from the edit's own input.
- glowup runs git without taking locks, so it never blocks Claude's own git commands.
- The compact form lists edited files only.
- With nothing touched, the tab says `Nothing changed yet.`

### Agents

Each subagent in this session. The tab stays live while background subagents run after the main turn ends.

- Name, elapsed time, token count, and a spinner while it runs or a check mark when it is done.
- Its task description.
- While it runs, the tool it is using now.
- With reduced motion on, the spinner is a still mark.
- The compact form is one line per subagent.
- With none, the tab says `No subagents this session.`

### Plan & context

- Claude's task list. `✓` is done, `◉` is in progress, `○` is next. The header shows done over total.
- A context bar with the percent used. It is blue-toned below 60%, amber from 60% and red from 80%, using your theme's `read`, `edit` and `fail` colors.
- Up to six bars for the biggest parts of the context, such as messages and tool results. Only parts that use tokens show.
- From 70% used, a warning line names the biggest part.
- The compact form is the checklist and one context bar.
- With no task list, the tab says `No task list yet.`

The tabs are read-only. You cannot select a file or open an agent from them. `/glowup config` replaces the tabs with a settings view until you press Apply or Cancel; see [Commands](commands.md#config). See the [roadmap](roadmap.md).
