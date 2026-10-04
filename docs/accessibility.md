---
title: Accessibility
description: Reduced motion, the high-contrast theme, narrow terminals and terminals without color.
order: 9
section: More
---

## Reduced motion

Run `/glowup motion reduced`, or set the `reducedMotion` setting to `true`. Run `/glowup motion full` to undo it.

With reduced motion on:

- Running subagents in the Agents tab show a still mark instead of a spinner.
- The spinner is Claude Code's own `stock` spinner, with its own word, even if your pack has a spinner or your theme has spinner words.
- There is no shimmer.
- The pet is hidden.
- No animation timers run.

Colors and row styles from your pack still apply.

glowup does not flash. Clawd's frames change no faster than every 80 ms; spinners move continuously. A color flash lasts at least 400 ms, and nothing flashes more than 2.5 times a second. Elapsed times still count up each second, because they are text that changes in place.

The choice is saved and wins over the setting. You can also toggle it in `/glowup config`.

glowup cannot read your operating system's reduced-motion setting, because Claude Code does not pass it to mods. Turn glowup's own setting on if you need it.

## High contrast

The `high-contrast` theme uses pure white text, a light grey for secondary text, and fully saturated colors for each kind of action. Switch with `/glowup theme high-contrast`.

To make your own, extend it and change what you need:

```json title="my-contrast.json"
{ "name": "my-contrast", "extends": "high-contrast", "colors": { "accent": "#00ffff" } }
```

## Narrow terminals

Under 80 columns glowup uses compact forms. The band is cut to fit, and the drawer is a short list with a tab strip. Nothing wraps or runs off the line: glowup measures each line in terminal cells and ends it with an ellipsis when it is too long. See [Layout](layout.md).

## Terminals without color

Color is never the only signal. Every state also has a glyph and words:

- The band names the action in words: `Editing`, `Reading`, `Running`.
- Passing and failing are `✓` and `✗` with the count.
- A request that needs you shows `!` and the words `Needs you`.
- Added and removed lines carry `+` and `−`.
- Hearts differ in shape: `♥` is full and `♡` is empty.
- Plan items differ in shape: `✓`, `◉` and `○`.

## Screen readers

The band, the pane tabs and the status entry are plain text. They contain no images. Clawd and the animated spinners are drawn with block and braille characters, so a screen reader may read them as symbols. Turn them off with `/glowup motion reduced`, which hides the pet and uses the stock spinner.
