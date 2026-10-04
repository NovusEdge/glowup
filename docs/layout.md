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
| Wide | The glowup pane is docked beside the transcript | The full pane. No band, because the pane shows the same things. |
| Medium | 80 columns or more, and the pane is not docked | The one-line band above the prompt. The pane is a drawer you open on request. |
| Compact | Under 80 columns | The band, cut to fit. The drawer is a small one with a tab strip and at most six rows. |

### When the pane docks

In fullscreen, glowup asks Claude Code to open its pane once. Claude Code docks a pane nobody asked for only at 144 columns or more. Once you have opened the pane yourself, it docks from 110 columns. Below that, the pane waits and the band shows instead.

![The glowup pane docked beside the transcript](assets/pane-wide.png)

### The drawer

Run `/glowup pane` to open the pane as a drawer above the prompt. Esc closes it. Run the command again to close it too. The drawer never opens on its own below the docking width.

A drawer narrower than 80 columns uses the compact form of each tab.

![The compact drawer in a narrow terminal](assets/compact.png)

## The band

The band is one line above the prompt. It shows while Claude works and stays for 1.5 seconds after the turn ends, then folds away. It shows, left to right:

- The current action with its glyph and color, for example `✎ Editing auth.ts`. Failures show in the `fail` color and passes in the `pass` color.
- The number of running subagents, for example `◆ 2 subagents`.
- Five hearts for the context you have left. Each heart is 20% of the window. The hearts empty as context fills.
- Plan progress as pips, `●●○○`, when Claude has a task list.

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
- In a git repository the counts come from `git diff --numstat` against the commit you started the session on, so edits made by shell commands count too. Counts for new untracked files, and for sessions outside git, come from the edit's own input.
- The compact form lists edited files only.
- With nothing touched, the tab says `Nothing changed yet.`

### Agents

Each subagent in this session.

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

The pane is read-only in 0.1.0. You cannot select a file or open an agent from it. See the [roadmap](roadmap.md).
