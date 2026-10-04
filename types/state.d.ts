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
  tab: 'changes' | 'agents' | 'plan'
  categories?: { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  maxTokens?: number
  reduced?: boolean
}
export type GlowupBubble = { text: string; mood: string; until: number }
export type GlowupPetInput = { working: boolean; kind?: string; needsYou: boolean; lastTest?: { passed: boolean; at: number }; doneAt?: number; doneOk?: boolean; actAt?: number }

// Live data the render sites read. A get while drawing subscribes that site alone;
// a set redraws only its readers. Values are JSON.
declare module 'claude-code' {
  interface PluginState {
    glowup: {
      band: { model: GlowupModel; at: number }
      pane: { model: GlowupModel; view: GlowupPaneView; at: number }
      spinner: { turnAt: number; detail: string; state: string; at: number }
      pet: { input: GlowupPetInput; overlays: string[]; bubble?: GlowupBubble; friday: boolean; at: number }    }
  }
}
