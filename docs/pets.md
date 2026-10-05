---
title: Pets
description: Clawd, the pixel pet at the bottom of the glowup pane. Where he appears, how he reacts, speech bubbles, and the shiny one.
---

## Clawd

Clawd is a pixel pet who sits at the bottom of the glowup pane and reacts to what Claude is doing. He is drawn in half-block characters in Claude Code's orange and keeps his colors under every pack and theme. He is the only pet so far, and he is on by default.

He only appears in the pane, never in the band above the prompt, so you see him when the pane is docked beside the transcript or opened as a drawer with `/glowup pane`. A drawer narrower than 80 columns shows a one-row Clawd, `▐▛█▜▌`, instead of the full sprite. Reduced motion and `/glowup pet off` both hide him.

## What he does

| | |
| --- | --- |
| ![Clawd standing and blinking](assets/clawd/idle/clip.gif) | When nothing is happening he stands around and blinks. |
| ![Clawd typing](assets/clawd/working/clip.gif) | While Claude edits files or runs commands, he types at his keyboard. |
| ![Clawd walking](assets/clawd/walk/clip.gif) | While Claude reads, searches or plans, he paces back and forth. |
| ![Clawd juggling](assets/clawd/juggle/clip.gif) | With three or more subagents running, he juggles them. |
| ![Clawd hopping](assets/clawd/hop/clip.gif) | A passing test makes him hop. |
| ![Clawd sagging and sweating](assets/clawd/fail/clip.gif) | A failing test makes him sag and sweat, and the sweat drop stays until your next prompt. |
| ![Clawd waiting with a question mark](assets/clawd/alert/clip.gif) | When Claude needs your approval, he startles and then waits with a `?` beside him. This only happens when Claude Code opens a permission dialog, so not in auto mode, even when the auto-mode check hands a call to you. |
| ![Clawd crumpling a sheet of paper](assets/clawd/scrunch/clip.gif) | When the context is compacted, he crumples up a sheet of paper and tosses it. |
| ![Clawd panting](assets/clawd/pant/clip.gif) | Once the context window is 80% full, he pants. |
| ![Clawd dancing](assets/clawd/done/clip.gif) | At the end of a turn he does a little dance. |
| ![Clawd asleep](assets/clawd/sleep/clip.gif) | After a minute with nothing happening he falls asleep, and stretches when something wakes him. |

On a Friday after 15:00, a deploy command gets him into a sweat outfit.

His frames change at most every 80 ms and nothing flashes more than 2.5 times a second. Under reduced motion, or in the narrow drawer, he does not animate.

## Speech bubbles

With bubbles on, Clawd says a short line (40 characters at most) when a turn ends, when a test fails and when Claude needs you, and the bubble stays for 3 seconds. Lines come from a small set of templates per mood, never the same one twice in a row, and some fill in details such as the failure count or the command. In the narrow drawer the line appears beside the one-row Clawd.

```text title="claude code"
/glowup bubbles off
/glowup bubbles on
/glowup bubbles haiku
```

### Lines written by Haiku

With `/glowup bubbles haiku`, glowup sometimes asks Claude Haiku for the line. The template line shows first, and Haiku's replaces it only if the reply arrives while that bubble is still up, so drawing never waits on the call.

**Cost.** Each line is a small Haiku call billed to your account, made with your session's credentials.

What it sends: the mood, the pose, the short label glowup already shows for the current tool, a test summary such as `failed 3`, and the time of day. It never sends your prompts, file contents, code or secrets. The reply is cleaned to one plain line of at most 40 characters; an empty reply falls back to the template.

glowup makes one call at a time, at most one per turn, at least 90 seconds apart, and abandons a call after 4 seconds. After an error or a timeout, and always in a `-p` run, under reduced motion or with the pet off, the template line stays and nothing is retried. Errors go to the debug log only.

## Choosing a pet

`/glowup pet off` hides Clawd and `/glowup pet clawd` brings him back. `/glowup pet list` shows the pets you can pick, which for now means Clawd and, once you have earned him, the shiny one. `/glowup config` asks about the pet and bubbles as well.

## The shiny pet

Keep your tests green and see what happens. When it does, glowup tells you, and `/glowup pet clawd-shiny` switches to a gold Clawd. Progress toward it carries across sessions.

![The shiny gold Clawd](assets/clawd/shiny/idle/clip.gif)

## Outfits

Clawd dresses up on some dates and at some hours, by your computer's local time:

- A Santa hat from 20 to 31 December.
- A pumpkin from 25 to 31 October.
- A party hat on the anniversary of the day you installed glowup.
- A nightcap between 23:00 and 04:59.

There are a few more that this page does not list.
