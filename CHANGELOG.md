# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Themes: new presets `glowup` (the new default), `aurora` and `dusk`. People who already chose a theme keep it. `classic` is still available.

### Changed

- A theme that fails to load now falls back to `glowup` instead of `classic`.

## [0.1.0] - 2026-10-04

### Added

- Cockpit pane with three tabs: Changes (files Claude touched, with line counts from git), Agents (subagents and what each is doing) and Plan & context (the task list and what fills the context window).
- Activity band above the prompt: what Claude is doing, running subagents, context hearts and plan progress.
- Themes: four presets (classic, cyberpunk, vaporwave, high-contrast), user theme files that extend them, and `/glowup theme add <url>` to install one.
- Theme-driven spinner words and tool glyphs on finished tool rows.
- A status entry while Claude works, and an opt-in takeover of the status line (`/glowup statusline on`, undone by `/glowup statusline restore`).
- The `/glowup` command for themes, the pane, motion and the status line.
- Reduced motion, from the plugin setting or `/glowup motion reduced`.
