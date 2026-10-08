---
name: glowup site
description: Landing page and studio for glowup, styled live by whichever glowup pack is active.
colors:
  # Runtime values. Every color is a custom property set on the .landing root by lookVars() from the active pack;
  # the hex values here are the default pack (classic) and exist only as a reference rendering.
  accent: "#d77757"
  bg: "#1f1f24"
  panel: "#1f1f24"
  text: "#e4e4e7"
  dim: "#8b8b94"
  faint: "#3a3a42"
  read: "#7dc4e4"
  edit: "#e5b567"
  shell: "#4eba65"
  agent: "#b39ddb"
  pass: "#4eba65"
  fail: "#ff6b80"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(44px, 7.4vw, 92px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(30px, 4vw, 44px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.005em"
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
  logo:
    fontFamily: "'Pixelify Sans', monospace"
    fontSize: "21px"
    fontWeight: 700
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "999px"
spacing:
  h-sm: "30px"
  h-md: "36px"
  h-lg: "44px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "{spacing.h-md}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "{spacing.h-md}"
  button-ghost:
    textColor: "{colors.dim}"
    rounded: "{rounded.md}"
    height: "{spacing.h-md}"
  button-link:
    textColor: "{colors.accent}"
  button-sm:
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "{spacing.h-sm}"
  segmented-item:
    textColor: "{colors.dim}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "{spacing.h-sm}"
  segmented-item-pressed:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
  chip:
    textColor: "{colors.text}"
    typography: "{typography.code}"
    rounded: "{rounded.full}"
    padding: "0 12px 0 6px"
    height: "{spacing.h-sm}"
  field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "{spacing.h-md}"
  menu-item:
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    height: "32px"
---

# Design System: glowup site

Scope: the landing page (`app/landing`) and the studio (`app/studio`), both rendered inside a `.landing` root. Tokens and shared controls live in `app/ui/system.css`; page layout lives in `app/landing/landing.css`, `app/studio/studio.css` and `app/studio/controls.css`. The docs pages are fumadocs-ui and take only the color tokens in `app/app.css`.

## Overview

**Creative North Star: "The Pack Is the Palette"**

The site is a glowup terminal turned outward. It has no fixed brand colors: `PackContext` resolves the active pack and `lookVars()` writes `--bg`, `--panel`, `--text`, `--dim`, `--faint`, `--accent` and the role colors (`--read`, `--edit`, `--shell`, `--agent`, `--pass`, `--fail`, plus `--addBg`, `--delBg`, `--sel`) onto the `.landing` root. Every other token is derived from those with `color-mix()`, so a pack change restyles every control, popup and page surface live.

The build is plain CSS on runtime custom properties. Base UI (`@base-ui/react`) supplies behavior and accessibility only: ToggleGroup for segmented controls, Select, and Popover. The styling is ours. Shadcn was considered and rejected because its components are Tailwind-classed and these pages are plain CSS on runtime properties.

**Key Characteristics:**
- Dark, pack-tinted surfaces; one accent per pack carries all emphasis.
- Two type voices: Geist for actions and prose, JetBrains Mono for command arguments and values.
- Flat controls with 1px hairline borders; shadow is reserved for floating layers.
- Base UI behavior, hand-written CSS, no Tailwind on these surfaces.

## Colors

The palette is whatever the active pack says it is; the frontmatter shows the default pack (classic) only as a reference rendering.

### Primary
- **Pack Accent** (`--accent`): the primary button fill, the pressed segment, chip selection, focus ring (2px solid, 2px offset), caret, checkbox/radio/range fill, link text and the menu check mark. Text on accent uses `--on-accent`, which is `--bg`.

### Neutral
- **Ground** (`--bg`): page background and the text color on accent.
- **Panel** (`--panel`, aliased `--surface`): fields, secondary buttons, popups, the studio sidebar.
- **Text** (`--text`), **Dim** (`--dim`), **Faint** (`--faint`, aliased `--line`): body text, secondary text and placeholders, hairline borders.
- **Derived:** `--line-strong` (dim 55% into faint) for hover borders and unchecked checkboxes; `--tint` (text 7%) and `--tint-strong` (text 12%) for ghost hover and the highlighted menu item; `--accent-soft` (accent 14%) for a selected chip's fill.

### Role colors
- **Read / Edit / Shell / Agent / Pass / Fail**: the colors glowup paints tool rows and results with in the terminal. On the site they color the terminal mocks; outside them, `--fail` marks invalid input and errors and `--edit` marks warnings and notes.

### Named Rules
**The No Fixed Color Rule.** No hex value is written into a landing or studio control. A new color is a `color-mix()` of the pack variables or it does not exist. The only fixed colors are the studio color wheel's hue/value gradients and its white thumb, which depict color itself.

**The Portal Home Rule.** Popups portal into the `.landing` root through `PortalContext`, never into `<body>`; outside the root the pack's custom properties do not reach them.

## Typography

**UI Font:** Geist (`--font-ui`, with system-ui)
**Code Font:** JetBrains Mono (`--font-code`, with ui-monospace)
**Logo Font:** Pixelify Sans (`--font-logo`), the wordmark only

**Character:** a tight, negatively tracked grotesk for what the site says and does, and a monospace for anything the user would type into a terminal.

### Hierarchy
- **Display** (700, clamp(44px, 7.4vw, 92px), 1, -0.045em): the hero heading only.
- **Headline** (700, clamp(30px, 4vw, 44px), 1.05, -0.035em): section headings.
- **Body** (400, 17px, 1.5, dim, max 640px): section ledes; the hero sub is 19px, the studio runs at 14px.
- **Label** (600, 13.5px, 1): button text; 12.5px at small size. Hints, field labels and error lines are 12.5px Geist in dim.
- **Code** (400, 13px): segment values, chips, fields, menu items, install command, command readouts (12px).

### Named Rules
**The Mono Means Argument Rule.** Mono (`--font-code`) is for command arguments and values: pack names, outfits, hex codes, commands. Geist (`--font-ui`) is for actions and prose. A segmented control whose options are UI words rather than arguments takes the `ui` variant to switch to Geist.

## Layout

The landing page is a single centered column (max 1240px, 20px gutters) under a floating nav (fixed, min(720px, 100% - 24px), blurred translucent `--bg`). Sections are spaced 110px apart (80px under 900px); card grids use `auto-fill` with 180px, 210px or 260px minimums and a 14px gap, falling to two columns under 900px.

The studio is a fixed full-viewport app at 900px and up: a top bar, a 360px scrolling sidebar of accordion sections on the left and the terminal preview filling the rest. Under 900px it stacks: preview first (capped at 50dvh, scrolling from its end), then the sidebar, with the three actions pinned to the bottom in a 44px-high grid.

Control heights come from `--h-sm` (30px), `--h-md` (36px) and `--h-lg` (44px). Under `pointer: coarse`, `--h-sm` and `--h-md` rise to 40px and 44px so every control meets a touch target without per-component overrides. Studio checkboxes, swatches and accordion headers hold a 44px minimum below 900px.

## Elevation & Depth

Flat at rest. Depth comes from tonal steps (`--bg` under `--panel`) and 1px hairlines, not from shadow.

### Shadow Vocabulary
- **Popup** (`--shadow-pop`: `0 12px 32px -8px #000b, 0 2px 6px -2px #0006`): Select and Popover panels.
- **Floating nav** (`0 10px 30px -12px #0009`) and **install bar** (`0 8px 24px -12px #0008`): the two landing elements that float over the hero.
- **Terminal window** (`0 30px 80px -24px #000c, 0 0 0 1px #0006`): the big terminal mock, which is presented as an object on the page.

### Named Rules
**The Float Earns Shadow Rule.** Only something that floats above content (a popup, the nav, a window mock) casts a shadow. Buttons, fields, chips and cards stay flat; their states are border and fill changes.

## Shapes

Small, even corners: `--r-sm` (6px) for small buttons, segment items and menu items; `--r-md` (8px) for buttons, fields and popups; `--r-lg` (12px) for the nav, install bar and mini terminal; `--r-full` for chips. Borders are 1px; the accent is the only thing that thickens them (the 2px focus ring).

**The Nested Radius Rule.** A nested element's radius is the outer radius minus the padding between them. The segmented track is `calc(var(--r-sm) + 3px)` around 3px padding so its items sit at `--r-sm`; the large track is `calc(var(--r-md) + 4px)` around 4px padding.

## Components

All shared controls are classes in `app/ui/system.css`, scoped under `.landing`. Motion is `--t-fast` (120ms) for color and border changes and `--t` (220ms) on `--ease` (`cubic-bezier(.16,1,.3,1)`) for popup scale; reduced motion drops button and popup transitions.

### Buttons (`.btn`)
One shape, four weights. All are `--h-md` high, 8px radius, 600 13.5px Geist, with a 16px icon slot and a 1px press-down on `:active`. Disabled is 45% opacity.
- **Primary** (`.btn-primary`): accent fill, `--on-accent` text, hover mixes 14% text into the accent. The single action a view wants: copy the install commands, open the studio, copy the share link.
- **Secondary** (`.btn-secondary`): panel fill with a hairline border that strengthens on hover and turns accent while its popover is open (`aria-expanded`). Sits beside a primary or stands alone where nothing is primary.
- **Ghost** (`.btn-ghost`): no fill, dim text, tint on hover. Icon and toolbar actions that must not compete with content (dismiss, reorder, remove).
- **Link** (`.btn-link`): accent text with a 45%-accent underline. Inline actions in prose.
- **Modifiers:** `.btn-sm` (`--h-sm`, 6px radius, 12.5px, 14px icon); `.btn-icon` (square, icon only, needs `aria-label`).

### Segmented control (`Segmented`, `.seg`)
Base UI ToggleGroup. One choice from a short fixed set, always one selected (pressing the current item does not clear it). Items are mono at `--h-sm`; the pressed item takes the accent fill. `size="lg"` raises items to `--h-md`; `ui` switches the items to Geist for options that are words, not arguments.

### Chip (`.chip`)
A pill that is pressable and also shows something, such as a theme's palette strip. Hairline border; pressed (`aria-pressed`) takes an accent border and `--accent-soft` fill. Use it when the option needs a visual sample; use a segment when it is a bare value.

### Fields (`.field`, inputs, `Select`)
Panel fill, hairline border, `--r-md`, `--h-md`, 13px mono. Hover strengthens the border; an open Select trigger takes the accent border; `aria-invalid` takes `--fail`. Checkboxes (5px radius) and radios are 18px and fill with the accent; range sliders run a 4px dim track with an accent thumb. `Select` wraps Base UI Select: the trigger is a `.field` with a chevron, the list is a `.menu` inside a `.pop`.

### Popups (`.pop`, `.menu`)
Panel fill, hairline border, `--r-md`, `--shadow-pop`, at least the anchor's width, scaling in from 97% at the anchor. Menu items are 32px mono rows with an accent check mark in a 14px leading column and `--tint-strong` on highlight. The studio's send popover (`.st-pop`) is a `.pop` holding a command readout.

### Icons (`app/ui/icons.tsx`)
Authored 16x16 SVGs, 1.5 stroke, round caps and joins, `currentColor`, `aria-hidden`. Shown at 16px in buttons and 14px in small buttons, fields and menus.

### Mini terminal (`.mini`) and terminal (`.term`)
Product content, not chrome: they render glowup's own output with the active pack's role colors, glyphs and row styles. The `cards` row style's 3px left border in the row's role color reproduces glowup's in-terminal rendering; it is a depiction of the product, not a decoration available to other components.

## Do's and Don'ts

### Do:
- **Do** derive every new color from the pack variables with `color-mix()`, and read it through the semantic tokens (`--surface`, `--line`, `--line-strong`, `--tint`, `--accent-soft`).
- **Do** keep one primary button per view; everything else beside it is secondary, ghost or link.
- **Do** set mono only on command arguments and values; actions and prose stay in Geist.
- **Do** size controls from `--h-sm` / `--h-md` / `--h-lg` so `pointer: coarse` lifts them to 40px and 44px.
- **Do** compute a nested radius as the outer radius minus the padding.
- **Do** portal any new popup into the `.landing` root via `usePortal()`.
- **Do** take behavior and accessibility from Base UI and write the styling in plain CSS.

### Don't:
- **Don't** write a fixed hex color into a landing or studio control.
- **Don't** use a Unicode glyph as an icon; use the authored SVGs in `icons.tsx` or add one in the same 16px, 1.5-stroke style. Glyphs inside the terminal mocks are glowup's output, not icons.
- **Don't** bring in Tailwind-classed component kits (shadcn and the like) for these surfaces.
- **Don't** put a shadow on a resting control or card.
- **Don't** borrow the cards row style's 3px left border as an accent stripe for site components.
