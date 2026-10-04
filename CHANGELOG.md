# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/glowup spinner <name|list|default>` sets just the spinner on top of the current pack, lists the spinners, or goes back to the pack's own.

### Changed

- `/glowup` now shows a short card with the five commands most people need, drawn in your pack's colors on the terminal and desktop app. `/glowup help all` lists every command in groups.
- Clawd now falls asleep after one minute with nothing happening, not ten.
- `/glowup config` offers "Keep <name>" first when your look is a user pack or has a theme or spinner on top, so you can move on without losing it. Picking an unchanged pack or pet no longer rewrites your saved settings, and an old summary row keeps the colors of the pack it names.
- `/glowup config` now asks up to three questions (pack, pet, extras) instead of opening a settings view in the pane. Each answer applies at once, Esc stops, and the command ends with a one-line summary. The spinner and per-layer pickers and the save-as-pack field are gone from it; `/glowup pack save <name>` still saves a look.

## [0.2.1] - 2026-10-04

### Fixed

- "Needs you" and Clawd's alert pose no longer show in auto, bypass and don't-ask modes, where no dialog opens.
- The docked pane now pushes the status box and Clawd to the bottom instead of leaving them right under the tab content.
- Clawd now walks sideways along the pane instead of stepping in place.

## [0.2.0] - 2026-10-04

### Added

- Themes: three new presets, `glowup`, `aurora` and `dusk`.
- Packs: one name or `https://` URL sets a whole look in two layers, colors and motion. Four built-in packs: `classic` (still the default), `crt`, `cozy` and `arcade`. Commands: `/glowup pack`, `pack list`, `pack save`.
- Row styles for your prompts, Claude's replies and tool calls: `classic`, `cards`, `minimal` and `retro`, plus an optional HP bar and COMBO tag.
- Pack spinners (`comet`, `eyes`, `orb-states`, `clawd`, `shimmer`) and a shimmering spinner word.
- `/glowup import <file>` turns a Ghostty or base16 color scheme into a pack.
- Clawd, a pixel pet at the bottom of the glowup pane, with reactions to work, tests and requests for you, and a one-row form in the narrow drawer. `/glowup pet clawd|off`.
- Speech bubbles for Clawd. `/glowup bubbles on|off`.
- Easter eggs, including a shiny Clawd and a few outfits.
- A first-run question that asks once whether glowup should draw the status line. `/glowup statusline restore` undoes it.
- `/glowup config`, an interactive settings view in the pane with a live preview.

### Changed

- glowup redraws only what changed, driven by state, instead of redrawing every hooked row on each event.
- Reduced motion now also means the stock spinner, no shimmer and no pet.
- Types and CI moved to Claude Code 2.1.289.

## [0.1.0] - 2026-10-04

### Added

- Cockpit pane with three tabs: Changes (files Claude touched, with line counts from git), Agents (subagents and what each is doing) and Plan & context (the task list and what fills the context window).
- Activity band above the prompt: what Claude is doing, running subagents, context hearts and plan progress.
- Themes: four presets (classic, cyberpunk, vaporwave, high-contrast), user theme files that extend them, and `/glowup theme add <url>` to install one.
- Theme-driven spinner words and tool glyphs on finished tool rows.
- A status entry while Claude works, and an opt-in takeover of the status line (`/glowup statusline on`, undone by `/glowup statusline restore`).
- The `/glowup` command for themes, the pane, motion and the status line.
- Reduced motion, from the plugin setting or `/glowup motion reduced`.
