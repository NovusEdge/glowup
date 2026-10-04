import { describeTool, testOutcome, planFrom, editCounts, type PlanItem } from './events.ts'
export type { PlanItem }

export type Act = { glyph: string; label: string; kind?: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent' }
export type Agent = { key: string; agentId?: string; name: string; task: string; state: 'running' | 'done'; startedAt: number; endedAt?: number; tokens?: number; now?: string }
export type FileTouch = { path: string; add: number; del: number; how: 'read' | 'edit' | 'new'; at: number }
export type NeedsYou = { toolUseId: string; what: string; before: Act }
export type Model = {
  working: boolean; doneAt?: number; act: Act; agents: Agent[]; plan: PlanItem[]; files: FileTouch[]; ctxPercent: number; needsYou?: NeedsYou
  // context percent once per finished turn (the first reading after turn-done replaces the stale one), capped at CTX_SAMPLES
  ctxHistory: number[]
  ctxSampledAt?: number
  ctxPeak: number
  compactions: number
  turnAt?: number
  // last time something visible happened; the pet sleeps after a long gap
  actAt: number
  // successful main-agent calls in a row this turn
  combo: number
  lastTest?: { passed: boolean; at: number }
}
export type Ev =
  | { type: 'turn-start'; at: number }
  | { type: 'tool-start'; at: number; tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown> }
  | { type: 'tool-end'; at: number; tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown>; isError: boolean; text: string; resultTaskId?: string; agentTokens?: number; writeType?: 'create' | 'update' }
  | { type: 'needs-you'; at: number; toolUseId: string; what: string }
  | { type: 'agent-bind'; toolUseId: string; agentId: string }
  | { type: 'agent-done'; at: number; agentId: string; tokens?: number }
  | { type: 'turn-done'; at: number; reason: 'answer' | 'aborted' | 'error' | 'refusal' }
  | { type: 'context'; percent: number }
  | { type: 'compact' }
  // Claude Code's saved task list; an empty read leaves the plan built from this session's calls
  | { type: 'plan-load'; plan: PlanItem[] }

export const LINGER_MS = 1500
export const CTX_SAMPLES = 120
// Own table: subagent "now" lines are labelled here, without a theme.
const GLYPH = { read: '▸', search: '⌕', edit: '✎', shell: '$', agent: '◆', plan: '◇', other: '·' } as const
const TONE: Record<string, Act['tone']> = { read: 'read', search: 'read', edit: 'edit', shell: 'shell', agent: 'agent', plan: 'accent', other: 'text' }

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export const initialModel = (): Model => ({ working: false, act: { glyph: '✻', label: 'Ready', tone: 'text' }, agents: [], plan: [], files: [], ctxPercent: 0, ctxHistory: [], ctxPeak: 0, compactions: 0, actAt: 0, combo: 0 })
export const agentsRunning = (m: Model) => m.agents.some(a => a.state === 'running')
// Subagents run in the background, so the main turn usually ends while they work.
export const isBusy = (m: Model) => m.working || agentsRunning(m)
export const bandVisible = (m: Model, now: number) => isBusy(m) || (m.doneAt !== undefined && now - m.doneAt <= LINGER_MS)

const ENDED: Record<Extract<Ev, { type: 'turn-done' }>['reason'], Act> = {
  answer: { glyph: '✓', label: 'Done', tone: 'pass' },
  aborted: { glyph: '■', label: 'Interrupted', tone: 'dim' },
  error: { glyph: '✗', label: 'Stopped', tone: 'fail' },
  refusal: { glyph: '✗', label: 'Stopped', tone: 'fail' },
}

// The permission question for this call is answered: show what Claude was doing again.
const answered = (m: Model, toolUseId: string): Model =>
  m.needsYou?.toolUseId === toolUseId ? { ...m, act: m.needsYou.before, needsYou: undefined } : m

// git runs while later tool calls land, so its answer may lack files added since
// it started; those keep their own counts. Files only git knows join the list.
export function mergeCounts(m: Model, refreshed: FileTouch[]): Model {
  const byPath = new Map(refreshed.map(f => [f.path, f]))
  const have = new Set(m.files.map(f => f.path))
  const merged = m.files.map(f => {
    const r = byPath.get(f.path)
    if (!r) return f
    // a shell command can edit a file Claude only read; git's counts prove it
    const how = f.how === 'read' && r.add + r.del > 0 ? 'edit' : f.how
    return { ...f, how, add: r.add, del: r.del }
  })
  return { ...m, files: [...merged, ...refreshed.filter(f => !have.has(f.path))].sort((a, b) => b.at - a.at) }
}

function touch(files: FileTouch[], path: string, at: number, how: FileTouch['how'], add = 0, del = 0): FileTouch[] {
  const old = files.find(f => f.path === path)
  const next: FileTouch = old
    ? { ...old, at, add: old.add + add, del: old.del + del, how: old.how === 'new' ? 'new' : how === 'read' && old.how !== 'read' ? old.how : how }
    : { path, at, how, add, del }
  return [next, ...files.filter(f => f.path !== path)].sort((a, b) => b.at - a.at)
}

export function applyEvent(m: Model, ev: Ev): Model {
  switch (ev.type) {
    case 'turn-start': return { ...m, working: true, doneAt: undefined, needsYou: undefined, turnAt: ev.at, actAt: ev.at, combo: 0, lastTest: undefined, act: { glyph: '✻', label: 'Thinking', tone: 'text' } }
    case 'turn-done': return { ...m, working: false, doneAt: ev.at, actAt: ev.at, needsYou: undefined, act: ENDED[ev.reason], ctxHistory: [...m.ctxHistory, m.ctxPercent].slice(-CTX_SAMPLES), ctxSampledAt: ev.at }
    case 'context': {
      const ctxPercent = Math.max(0, Math.min(100, Math.round(ev.percent)))
      const fresh = !m.working && m.ctxSampledAt !== undefined && m.ctxSampledAt === m.doneAt && m.ctxHistory.length > 0
      return { ...m, ctxPercent, ctxPeak: Math.max(m.ctxPeak, ctxPercent), ctxHistory: fresh ? [...m.ctxHistory.slice(0, -1), ctxPercent] : m.ctxHistory }
    }
    case 'compact': return { ...m, compactions: m.compactions + 1 }
    case 'plan-load': return ev.plan.length ? { ...m, plan: ev.plan } : m
    case 'needs-you': return { ...m, actAt: ev.at, needsYou: { toolUseId: ev.toolUseId, what: ev.what, before: m.needsYou?.before ?? m.act }, act: { glyph: '!', label: `Needs you: ${ev.what}`, tone: 'fail' } }
    case 'agent-bind': return { ...m, agents: m.agents.map(a => a.key === ev.toolUseId ? { ...a, agentId: ev.agentId } : a) }
    case 'agent-done': return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId && a.state === 'running' ? { ...a, state: 'done' as const, endedAt: ev.at, now: undefined, tokens: ev.tokens ?? a.tokens } : a) }
    case 'tool-start': {
      const d = describeTool(ev.tool, ev.input)
      if (ev.agentId) return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId ? { ...a, now: `${GLYPH[d.kind]} ${d.label}` } : a) }
      const agents = ev.tool === 'Agent'
        ? [...m.agents, {
            key: ev.toolUseId,
            name: text(ev.input.name) || text(ev.input.subagent_type) || text(ev.input.description) || 'agent',
            task: text(ev.input.description),
            state: 'running' as const,
            startedAt: ev.at,
          }]
        : m.agents
      const act: Act = { glyph: GLYPH[d.kind], label: d.label, kind: d.kind, tone: TONE[d.kind]! }
      // a parallel call must not hide an open question; it becomes what shows after the answer
      if (m.needsYou) return { ...m, agents, needsYou: { ...m.needsYou, before: act } }
      const changed = act.glyph !== m.act.glyph || act.label !== m.act.label
      return { ...m, agents, act, actAt: changed ? ev.at : m.actAt }
    }
    case 'tool-end': {
      const d = describeTool(ev.tool, ev.input)
      let next = answered(m, ev.toolUseId)
      // only tokens: a background Agent call returns at once, so done comes from agent-done
      if (ev.tool === 'Agent' && !ev.agentId && ev.agentTokens !== undefined) {
        next = { ...next, agents: next.agents.map(a => a.key === ev.toolUseId ? { ...a, tokens: ev.agentTokens } : a) }
      }
      if (!ev.isError && d.file) {
        // editCounts has no answer for NotebookEdit (no line diff); it is still an edit.
        const counts = editCounts(ev.tool, ev.input) ?? (ev.tool === 'NotebookEdit' ? { add: 0, del: 0 } : undefined)
        const how: FileTouch['how'] = ev.tool === 'Write' && ev.writeType === 'create' ? 'new' : counts ? 'edit' : 'read'
        next = { ...next, files: touch(next.files, d.file, ev.at, how, counts?.add, counts?.del) }
      }
      // a failed spawn never gets an agent-done
      if (ev.tool === 'Agent' && !ev.agentId && ev.isError) {
        next = { ...next, agents: next.agents.map(a => a.key === ev.toolUseId && a.state === 'running' ? { ...a, state: 'done' as const, endedAt: ev.at, now: undefined } : a) }
      }
      // a subagent's own todo list is not Claude's plan
      const plan = ev.isError || ev.agentId ? undefined : planFrom(ev.tool, ev.input, next.plan, ev.resultTaskId)
      if (plan) next = { ...next, plan }
      if (!ev.agentId) next = { ...next, combo: ev.isError ? 0 : next.combo + 1 }
      if (!ev.agentId && d.isTest) {
        const o = testOutcome(ev.text, ev.isError)
        next = {
          ...next,
          act: { glyph: o.passed ? '✓' : '✗', label: o.summary, tone: o.passed ? 'pass' : 'fail' },
          lastTest: { passed: o.passed, at: ev.at },
          actAt: ev.at,
          combo: o.passed ? next.combo : 0,
        }
      }
      return next
    }
  }
}
