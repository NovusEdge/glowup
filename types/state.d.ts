// The loader reads this file alone, so it cannot import: Model and PaneView are
// mirrored here by JSON shape (hooks/model.ts, hooks/pane.tsx) and cast at the get.
export type GlowupAct = { glyph: string; label: string; kind?: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent' }
export type GlowupAgent = { key: string; agentId?: string; name: string; task: string; state: 'running' | 'done'; startedAt: number; endedAt?: number; tokens?: number; now?: string }
export type GlowupFileTouch = { path: string; add: number; del: number; how: 'read' | 'edit' | 'new'; at: number }
export type GlowupPlanItem = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }
export type GlowupModel = {
  working: boolean
  doneAt?: number
  act: GlowupAct
  agents: GlowupAgent[]
  plan: GlowupPlanItem[]
  files: GlowupFileTouch[]
  ctxPercent: number
  needsYou?: { toolUseId: string; what: string; before: GlowupAct }
}
export type GlowupPaneView = {
  tab: 'changes' | 'agents' | 'diff' | 'plan'
  diff?: Record<string, { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; text: string }[]>
  categories?: { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  maxTokens?: number
  reduced?: boolean
}
export type GlowupBubble = { text: string; mood: string; until: number }
export type GlowupPetInput = { working: boolean; kind?: string; needsYou: boolean; lastTest?: { passed: boolean; at: number }; doneAt?: number; doneOk?: boolean; actAt?: number }

// $.glowup: each method is an event a renderer plugin hooks (list glowup under its
// plugin.json dependencies) to draw part of a pack its own way. Answer `{ value }`;
// glowup's own method answers null, and glowup then draws what it always draws.
// Answers are checked (hooks/renderers.ts): a malformed one counts as null.
export type GlowupSeg = { text: string; color?: string; bold?: boolean }
export type GlowupColors = Record<'accent' | 'text' | 'dim' | 'faint' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'panel' | 'addBg' | 'delBg' | 'sel', string>
// pack is the active colors pack's name, so a renderer answers only for its own pack.
export type GlowupFieldArgs = { pack: string; cols: number; rows: number; colors: GlowupColors; reduced: boolean }
// A loop: frames of rows, played every ms (40 to 2000). Rows past `rows` are cut from the top.
export type GlowupFrames = { ms: number; frames: GlowupSeg[][][] }
export type GlowupWindow = { label: string; usedPercent: number; reset: string }
export type GlowupMeterArgs = { pack: string; width: number; windows: GlowupWindow[]; ctxPercent: number; colors: GlowupColors }
export type GlowupDividerArgs = { pack: string; turn: number; colors: GlowupColors }
// fill is one cell, repeated between left and right to the transcript's width.
export type GlowupDivider = { left: GlowupSeg[]; fill: GlowupSeg; right: GlowupSeg[] }
export type Glowup = {
  // the docked pane's open rows, below the tab and above the status box
  field(args: GlowupFieldArgs): Promise<GlowupFrames | null>
  // the rows under the status line in the pane's status box (at most three)
  meter(args: GlowupMeterArgs): Promise<GlowupSeg[][] | null>
  // a rule drawn above each of the person's own prompts
  divider(args: GlowupDividerArgs): Promise<GlowupDivider | null>
}

// Live data the render sites read. A get while drawing subscribes that site alone;
// a set redraws only its readers. Values are JSON.
declare module 'claude-code' {
  interface EngineInterface {
    glowup: Glowup
  }
  interface PluginState {
    glowup: {
      band: { model: GlowupModel; at: number }
      pane: { model: GlowupModel; view: GlowupPaneView; at: number }
      spinner: { turnAt: number; detail: string; state: string; at: number }
      haiku: { lastAt: number }
      pet: { input: GlowupPetInput; overlays: string[]; bubble?: GlowupBubble; friday: boolean; at: number }
    }
  }
}
