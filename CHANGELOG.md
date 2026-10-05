# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/glowup setup`: pick and order the band's parts and the pane's tabs, set when context and usage turn warning and danger colors, choose which moments get a speech bubble and how long it stays, and how soon the pet falls asleep. Your setup is never changed by installing a pack.
- `/glowup pack <studio link>` installs a look straight from a glowup studio link, with nothing downloaded.
- `/glowup color list` draws each color and says what it paints.
- glowup shows a toast when a session runs an older copy than the one installed, for example after `claude plugin update`, and says to run `/reload-plugins`.
- The Plan & context tab says more about the context. The bar marks where auto-compact runs. A two-row braille chart replaces the sparkline and draws the auto-compact point as a dashed rule. A line under it gives the growth per turn and how many turns are left before auto-compact. The tab lists the three heaviest sources you can trim, such as an MCP server's tools, a `CLAUDE.md` or the skill listing, and shows the prompt cache hit rate.

### Changed

- The pane's context warning now appears at the danger threshold, 80% by default (it was 70%).
- The last change wins between the `/plugin` settings and the `/glowup` commands. A value changed in `/plugin` is applied at the next session start or after `/reload-plugins`, as if you had typed the matching command; before, a saved `/glowup` choice always won.
- `/glowup config` ends on a card in the pack's look, with what you picked and three commands to try next, in place of the one-line summary.

## [0.4.1] - 2026-10-05

### Changed

- The README describes the 0.4 pane, Clawd's new reactions and the `/plugin` settings, and its screenshots and animation show the boxed pane.

## [0.4.0] - 2026-10-05

### Added

- Clawd juggles while three or more subagents run, crumples up a sheet of paper when the context is compacted, and pants while he stands or walks once the context window is 80% full.

### Changed

- The pane's tabs are drawn as boxes in the shape of your pack's border, and Plan & context has room to breathe: the loose divider is gone, rows line up, and free context is a solid faint track.
- Clawd stretches and yawns when he wakes up.
- While Claude waits on you, Clawd shows a `?` and has his own waiting animation, so it no longer replays the startle.
- The hearts beside the pet in the pane's status box show the usage you have left, the 5-hour or weekly limit, whichever is tighter. On an API key, where there are no limits, they give way to what the session has spent. The band's hearts still track context.

## [0.3.5] - 2026-10-05

### Added

- Pick the status line's fields and their order with `/glowup statusline fields <ids>`, the `/glowup config` "Status line fields?" question, or the `statusline` setting. New fields show your 5-hour and weekly usage with reset times, cost, model, running subagents, plan progress, branch, changes and folder. The status line glowup draws now uses your theme's colors; the entry under the prompt stays plain.

### Changed

- `/glowup config` ends at Extras when you press Esc there, as on every other question.

### Fixed

- The Changes tab lists only files Claude edited or created. Files it only read no longer appear there, and the "done" speech bubble names an edited file.
- Haiku speech bubbles are no longer cut off mid-word or mid-sentence. A Haiku line that is too long or hit its token cap is dropped and the template line stays.

## [0.3.4] - 2026-10-05

### Fixed

- A long Changes, Agents or Plan & context tab no longer pushes Clawd and the status box off the bottom of the pane. The tab now scrolls inside the rows left over, with `↑ N more` and `↓ N more` buttons (hotkeys `k` and `j`).
- The installer prints `Checking Claude Code...` while it asks `claude` about its version and plugins, which takes a few seconds, instead of showing a blank terminal. If `claude` has not answered after 60 seconds, the installer stops and says so.
- The installer's pack list no longer disappears in xterm: unselected packs were drawn in a fixed light gray that matched xterm's white background. They now use the terminal's own text color.
- The installer no longer drops to 16 colors under `TERM=xterm`, which turned the preview pure blue, red and magenta. It uses 256 colors, or 24-bit when xterm says it has them.

## [0.3.3] - 2026-10-04

### Added

- Packs can set `colors.rowFlags`: `labels`, `markers` and `xp`, so any pack can drop the `you` and `claude` labels, mark rows with `▶` and `◆`, and show a `+N XP` tag above a reply.
- `/glowup color`: list every color role with its hex, set one with `/glowup color <role> <#hex>`, or clear with `/glowup color reset [role]`. Overrides are saved and stay on top of any pack or theme, and `/glowup export konsole` and `/glowup pack save` use them.
- `/glowup config` has a "Tweak colors" extra that asks for a role and a hex.
- The pack-making skill can change an existing pack or theme: it extends a built-in with only your changes, edits your own packs, and suggests `/glowup color` for a small color tweak.

### Changed

- `arcade` marks your prompt with a pink `▶` and Claude's reply with a cyan `◆`, with no labels or bars, and shows `+N XP` above a reply after tool calls succeed.
- `cozy` keeps its bars and no longer shows the `you` and `claude` labels.

## [0.3.2] - 2026-10-04

### Fixed

- Restyled tool rows draw again. Claude Code refused them because of a box setting around its own row, so every tool row fell back to the stock look.
- The pane and band no longer fail to draw after an update or reload when the saved state comes from an older glowup.
- Updating glowup no longer shows the "glowup is loaded twice" toast or turns the new version off.

## [0.3.1] - 2026-10-04

### Added

- Speech bubbles written by Haiku. `/glowup bubbles haiku`, the `bubbles` setting, the config questions and the installer's `--bubbles haiku` turn it on. It is opt-in: each line is a small Haiku call on your account, at most one per turn and one per 90 seconds, built from glowup's own state only, with the template line as the fallback.

### Fixed

- "Needs you" no longer shows when nobody is being asked, as in auto mode. glowup used to guess the permission mode from the footer labels, which never name it, so it always guessed "ask". It now alerts only when Claude Code actually opens a permission dialog in a mode that asks you, and stays quiet when unsure.
- In auto mode glowup does not alert, even when the auto-mode check hands a call to you. It alerts only for a dialog Claude Code opens, and not when another hook has already decided the request.
- Speech bubbles wrap onto a second line in the pane instead of running past the edge. A Haiku line that arrives late now shows for the full 3 seconds instead of a blink, and Haiku is told only the kind of work, never a command, path or search pattern.
- The plan tab reads the newest 200 task files, so a long-running list no longer hides the task in progress.
- Clawd keeps his working pose while subagents run, including after the main turn has ended and while you view a subagent's transcript.
- `/glowup pack`, `theme`, `pet`, `bubbles`, `motion`, `statusline` and `import` with no argument now show the current setting or how to use them, instead of "Unknown" and the help card.
- The Plan & context tab shows Claude Code's saved task list. It loads when the session starts and again after each `TaskCreate` or `TaskUpdate`, so tasks from earlier sessions no longer leave the plan empty.

### Changed

- The context section has a new chart: one stacked bar with a colored segment per part of the context, a wrapping legend, and a sparkline of the percent over the session with the peak and compactions. The plan and context sections now have ruled headers and a divider between them.

## [0.3.0] - 2026-10-04

### Added

- A one-line installer: `curl -fsSL https://glowup.khimani.dev/install.sh | sh`. It previews each pack while you pick a pack, a pet and extras, then installs the mod with `claude plugin`. Each release now carries the installer for Linux and macOS, and a Windows download.
- The installer lets you pick a pack's colors and spinner on their own, and shows Clawd and a wider preview while you choose. It also takes `--theme` and `--spinner`, backed by a new `spinner` setting for the mod (`pack`, the default, keeps the pack's own; `/glowup spinner` still wins).
- A pack-making skill ships with glowup: ask your agent for a glowup pack from a mood, palette, image or terminal scheme.
- `/glowup export konsole` saves your current colors as a Konsole color scheme you can pick in your profile.

### Changed

- Clawd's nightcap now shows from 23:00 to 04:59, and a failed test run gives him the sweat drop until your next prompt.
- The `cards` row style now puts your prompts and Claude's replies on a side bar instead of a box, and draws tool calls in a dim box.
- Clawd's done dance now lasts 4 seconds instead of 1.5.
- Chat rows in every row style except `classic` now keep a one-column margin on the left.
- In the `retro` row style, the `[YOU]` tag now sits on its own line above your prompt, and bodies are indented 3 columns instead of 9.
- `/glowup config` now asks which spinner you want, right after the pack, and the summary line names a spinner you set.
- glowup's own spinner now sits 2 columns in from the left edge instead of touching it.
- The docs site moved to https://glowup.khimani.dev.
- The installer sends an installed glowup only the settings that version has (it failed on one without `spinner`) and says which picks it skipped. It also refuses to install while another glowup copy is loaded.

### Fixed

- Two copies of glowup in one session (installed plus `claude --plugin-dir .`) showed false "Needs you" alerts. Now one copy stays on (a `--plugin-dir` copy wins) and the other turns itself off with a toast. Old status files are cleaned up, and session ids are cleaned before they reach a file name.
- glowup's status line script could call itself when two copies of glowup were loaded, starting shells until the machine ran out of memory. It now never falls back to itself, and the first-run question no longer takes over a status line glowup already draws.
- Tool results no longer clip at the right edge, and the `[ OK ]` mark no longer wraps, because rows now take less width around Claude Code's own output.

## [0.2.2] - 2026-10-04

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
