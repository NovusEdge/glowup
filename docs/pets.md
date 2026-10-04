---
title: Pets
description: Clawd, the pixel pet at the bottom of the glowup pane. Where he appears, how he reacts, speech bubbles, and the shiny one.
order: 5
section: Use
---

## Clawd

Clawd is a small pixel pet. He lives at the bottom of the glowup pane and reacts to what Claude does. He is hand-drawn in half-block characters, in Claude Code's orange (`#d77757`). He keeps his own colors under every pack and theme.

Clawd is the only pet in 0.2.0. He is on by default.

## Where he appears

Clawd lives only at the bottom of the glowup pane. He is not in the band above the prompt.

| Where | What you see |
| --- | --- |
| The pane docked beside the transcript | The full Clawd, about 24 columns wide and 6 rows tall, at the bottom, with his speech bubble. |
| The drawer, 80 columns or wider | The full Clawd at the bottom of the drawer. |
| The drawer, under 80 columns | A one-row Clawd, `▐▛█▜▌`, at the bottom of the drawer. |

Claude Code docks the pane without being asked only at 144 columns or more. Below that, run `/glowup pane` to open it. See [Layout](layout.md) for the tiers.

Reduced motion hides the pet. So does `/glowup pet off`.

glowup cannot hide Claude Code's own task list. The Plan & context tab shows the same list, so you can read it in the pane next to Clawd.

## What he does

| When | Clawd |
| --- | --- |
| Nothing is happening | Stands and blinks. |
| Claude edits files or runs commands | Types at his keyboard. |
| Claude reads, searches or plans | Walks back and forth. |
| A test passes | Hops. |
| A test fails | Sags and sweats. |
| Claude needs you, for example to approve a tool | Startles, with a `!` beside him. |
| A turn ends | Does a little dance. |
| Ten minutes with nothing happening | Falls asleep. |

On a Friday after 15:00, when Claude runs a deploy command, Clawd puts on a sweat outfit.

Movement frames change no faster than every 80 ms, and a color flash lasts at least 400 ms. glowup never flashes more than 2.5 times a second. Under reduced motion or in the narrow drawer nothing ticks.

## Speech bubbles

With bubbles on, Clawd says a short line when a turn ends, when a test fails and when Claude needs you. The bubble sits beside him for 3 seconds. Lines come from a small set of templates per mood and do not repeat twice in a row. Some use what happened, such as the failure count or the command. A line is at most 40 characters.

In a narrow drawer the bubble line shows beside the one-row Clawd.

```text title="claude code"
/glowup bubbles off
/glowup bubbles on
```

Bubbles are on by default. The choice is saved.

## Choose a pet

| Command | What it does |
| --- | --- |
| `/glowup pet clawd` | Show Clawd. Prints `Pet: clawd`. |
| `/glowup pet off` | Hide the pet. Prints `Pet: off`. |
| `/glowup pet list` | List the pets you can pick. A filled dot marks the current one. |
| `/glowup pet clawd-shiny` | The shiny Clawd, once you have unlocked him. |

You can also pick the pet and bubbles in `/glowup config`. The `pet` and `bubbles` settings in the Claude Code settings menu are the defaults; see the settings paragraph in [Commands](commands.md#settings-and-the-store).

## The shiny pet

Keep your tests green and see what happens.

When it happens, glowup shows a notice, and `/glowup pet clawd-shiny` starts working. Until then it prints `The shiny pet is not unlocked yet.` The count is kept across sessions.

The shiny Clawd is gold (`#f2c94c`).

## Outfits

Clawd dresses for some days and hours, by your computer's local time:

- A Santa hat from 20 to 31 December.
- A pumpkin from 25 to 31 October.
- A party hat on the anniversary of the day you installed glowup.
- A nightcap between 02:00 and 04:59.

The outfits are cosmetic and need no setting. There are a few more surprises that this guide does not list.
