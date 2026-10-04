# glowup launch video

A 33 s product video built entirely in code. Nothing in it is captured: the Claude Code
window, the installer picker, the spinners and Clawd are all drawn each frame from
glowup's own data, so text stays sharp at any camera zoom.

```
just demo-editor    # live preview in the Revideo editor
just demo-render    # out/launch.mp4 (1920x1080) and out/launch-square.mp4 (1080x1080)
```

Render one file with `pnpm render launch.mp4`. The render runs headless Chromium (it uses
`/usr/bin/chromium`; set `CHROMIUM=/path` to override) and ffmpeg, one worker, about
2.5 minutes per output. `demo-render` wraps it in `systemd-run` with a 6G memory cap.

## Where the pictures come from

- Pack colors, themes, spinner frames: `installer/internal/packs/packs.json`.
- Clawd: `hooks/sprites/clawd.ts`. Its pixel rows are drawn as canvas rectangles, one
  sprite pixel per terminal cell wide and half a cell tall, and animated from the sheet's
  own frame timings (idle, walk, hop, working, done, fail).
- Row styles (classic, cards, retro) follow `hooks/rows.tsx` and `hooks/rows-text.ts`.
- The picker follows `installer/internal/tui` (step line, form, Clawd and bubble, preview).
- Font: JetBrains Mono from `@fontsource/jetbrains-mono`, bundled in the render.

## How it is built

| file | job |
| --- | --- |
| `src/scenes/launch.tsx` | the storyboard: hook, Clawd, packs tour, installer, end card |
| `src/term.tsx` | terminal window, conversation rows per pack style, spinner |
| `src/screen.tsx` | Claude Code screen: prompt, spinner, Clawd's band, speech bubble |
| `src/picker.tsx` | the installer picker |
| `src/pixels.ts` | Clawd's sprite node and animation player |
| `src/stage.tsx` | camera, wipes, captions |
| `src/look.ts` | the colors of one window as tweenable signals |

A pack switch is a single tween of the window's color signals plus a rebuild of the rows
in the new pack's style.

Everything that changes per frame (Clawd, spinners, text that follows a signal) is
updated from one loop in `Stage.run`, driven by the scene clock, so any frame renders
the same regardless of where playback started.

The camera is `Stage.focus(region, seconds)`: Revideo's 2D package has no camera node, so
it scales, rotates and moves a world node so a region of the terminal (in cell units,
via `Claude.region(col, row, w, h)`) lands centered. Captions and wipes sit outside the
camera. Both outputs come from the same scene; the size is a render setting and the
camera fits regions to whatever frame it is given.

## Tooling choices

- **Revideo 0.11.0** (MIT, fork of Motion Canvas with headless rendering). Last release
  2026-07-10, repo pushed to in July 2026, renders headlessly on Linux through
  puppeteer. Motion Canvas (MIT) was the fallback; its last npm release is from
  February 2025, so Revideo wins. Remotion was dropped by the owner's choice.
- Versions are pinned exactly in `package.json`.
- pnpm 10+ blocks dependency build scripts by default; `pnpm-workspace.yaml` lists the
  ones this project needs (esbuild, ffmpeg binaries, puppeteer, revideo telemetry).
  Puppeteer's own Chrome download is not needed when system Chromium is present
  (`PUPPETEER_SKIP_DOWNLOAD=1 pnpm install`).
- On a fresh `node_modules` the first render fails once while vite re-optimizes its
  dependencies; `render.ts` retries.
- The pane (Changes, Agents, Plan tabs) is not in the video yet.
