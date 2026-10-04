---
title: Roadmap
description: What glowup 0.2.0 does, and what is planned for later releases.
order: 10
section: More
---

## What 0.2.0 has

- Everything in 0.1.0: the pane with its Changes, Agents and Plan & context tabs, the band above the prompt, themes as JSON files, the status entry and the opt-in status line takeover, and reduced motion.
- Three new theme presets: `glowup`, `aurora` and `dusk`. `classic` is still the default.
- [Packs](packs.md): one name sets a whole look, in a colors layer and a motion layer. Four built-in packs, `classic`, `crt`, `cozy` and `arcade`, shareable pack files, and import from Ghostty and base16 color schemes.
- Row styles for your prompts, Claude's replies and tool calls, a spinner library, and a shimmer.
- [Clawd](pets.md), a pixel pet at the bottom of the pane, with reactions, outfits and speech bubbles.
- A few easter eggs, including a shiny Clawd.
- The first-run question about the status line.
- `/glowup config`, a settings view in the pane.
- glowup redraws only what changed, instead of everything on every event.

## Coming later

These are planned. None of them is in 0.2.0, and the order and timing can change.

- Sound and voice layers for packs. The pack file format already reserves the keys.
- More spinners.
- More pets: Kit and Blip.
- Import of iTerm2 color schemes.
- A diff view in the Changes tab: pick a file and see its diff.
- Opening an agent from the Agents tab to see its tool calls.
- Styling for the Claude desktop app.

A pack or theme written for 0.2.0 will keep working.

## Ideas for Clawd

Not planned yet. Each idea uses something glowup can already see.

Outfits:

- Hard hat during a long build or install (`cargo build`, `pnpm install`, `docker build`).
- Detective hat and magnifier when a turn runs many searches.
- Headphones when a turn runs past five minutes.
- A crown when the test suite passes after earlier failures in the session.
- A bandage after three failed test runs in a row, off at the next pass.
- A graduation cap on the first commit in a new repository.
- Sunglasses on `git push --force`.
- A party horn from December 31 to January 1.
- A birthday cake on your install anniversary, beside the party hat.
- A clover on March 17.

Animations:

- Juggling while three or more subagents run.
- Stretching and yawning when he wakes up.
- Panting when the context window is over 80% full.
- Sweeping after `/compact` or a context clear.
- Waving at session start and when you come back after he fell asleep.
- Eating a cookie when a turn finishes in under ten seconds.
- Sneezing when a command fails with "permission denied".
- Spinning in place when a retry works after a tool error.

Small touches:

- Weekday moods: slower on Monday, bouncier on Friday afternoon.
- A rare idle, about once a day, where he looks straight at you.
- Sparkles around him at a combo of ten or more.

## Ask for something

To suggest a feature, open an issue on [GitHub](https://github.com/NovusEdge/glowup/issues). A change to the theme or pack file format starts as an issue that states the design. See `CONTRIBUTING.md` in the repository.
