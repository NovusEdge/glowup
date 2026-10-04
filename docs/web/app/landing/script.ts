export type Kind = 'read' | 'edit' | 'shell' | 'agent'
export type Row =
  | { t: 'user'; text: string }
  | { t: 'tool'; kind: Kind; verb: string; target: string; meta?: string }
  | { t: 'result'; text: string; tone?: 'ok' | 'bad' }
  | { t: 'diff'; lines: Array<['add' | 'del', string]> }
  | { t: 'say'; text: string }
export type FileStat = { name: string; kind: 'read' | 'edit'; add?: number; del?: number }
export type TermState = {
  typed: string; rows: Row[]; files: FileStat[]; hearts: number; ctx: number; combo: number
  band: null | { kind: Kind | 'fail' | 'pass'; text: string; agents: number }; bandOn: boolean
  status: { tone: 'idle' | 'work' | 'bad' | 'done'; text: string }
  pet: { kind: 'wander' } | { kind: 'pose'; pose: string }; bubble: null | 'fail' | 'done'
}
export type Step = { at: number; apply: (s: TermState) => TermState }

const PROMPT = 'login lets ?next= send people off-site, fix it'
const TYPE_AT = 1600, TYPE_MS = 35, HOLD_MS = 350, BUBBLE_MS = 2600, MAX_ROWS = 18
const WANDER = { kind: 'wander' } as const

export function initialState(): TermState {
  return {
    typed: '', rows: [], files: [], hearts: 5, ctx: 2, combo: 0, band: null, bandOn: false,
    status: { tone: 'idle', text: '· idle' }, pet: WANDER, bubble: null,
  }
}

const push = (s: TermState, ...r: Row[]): TermState => ({ ...s, rows: [...s.rows, ...r].slice(-MAX_ROWS) })
const band = (s: TermState, kind: Kind, text: string, agents = 0): TermState =>
  ({ ...s, band: { kind, text, agents }, bandOn: true, status: { tone: 'work', text: `◇ ${text}` } })
const file = (s: TermState, f: FileStat): TermState =>
  ({ ...s, files: s.files.some(x => x.name === f.name) ? s.files.map(x => (x.name === f.name ? f : x)) : [...s.files, f] })
const tool = (kind: Kind, verb: string, target: string, meta?: string): Row => ({ t: 'tool', kind, verb, target, ...(meta ? { meta } : {}) })
const pose = (pose: string) => ({ kind: 'pose', pose }) as const

const steps: Step[] = []
const at = (ms: number, apply: (s: TermState) => TermState) => steps.push({ at: ms, apply })

for (let i = 0; i < PROMPT.length; i++) at(TYPE_AT + i * TYPE_MS, s => ({ ...s, typed: PROMPT.slice(0, i + 1) }))

// Offsets follow the mockup's sleep() chain in hero.html loop().
const T0 = TYPE_AT + PROMPT.length * TYPE_MS + HOLD_MS
const T1 = T0 + 1100, T2 = T1 + 1000, T3 = T2 + 1100, T4 = T3 + 1500, T5 = T4 + 1300
const T6 = T5 + 1900, T7 = T6 + 1200, T8 = T7 + 1100, T9 = T8 + 1200
const T10 = T9 + 900, T11 = T10 + 1500, T12 = T11 + 2600, T13 = T12 + 3500

at(T0, s => {
  const n = push({ ...s, typed: '' }, { t: 'user', text: PROMPT })
  return file(push(band({ ...n, pet: pose('working'), ctx: 4 }, 'read', 'Reading src/auth.ts'),
    tool('read', 'Read', 'src/auth.ts'), { t: 'result', text: 'Read 84 lines' }), { name: 'src/auth.ts', kind: 'read' })
})
at(T1, s => file(push(band(s, 'read', 'Searching "next="'), tool('read', 'Search', '"next=" in src'), { t: 'result', text: 'Found 6 matches' }),
  { name: 'src/routes.ts', kind: 'read' }))
at(T2, s => push({ ...band(s, 'agent', 'Delegating', 1), hearts: 4, ctx: 9 }, tool('agent', 'Task', 'Explore: find other redirect callers')))
at(T3, s => file({ ...push(band(s, 'edit', 'Editing src/auth.ts', 1), tool('edit', 'Update', 'src/auth.ts', '+9 −2'),
  { t: 'diff', lines: [['del', 'return { ok: true, redirect: next }'], ['add', 'const target = safeNext(next) ?? "/"'], ['add', 'return { ok: true, redirect: target }']] }),
  combo: s.combo + 1 }, { name: 'src/auth.ts', kind: 'edit', add: 9, del: 2 }))
at(T4, s => push({ ...band(s, 'shell', 'Running pnpm test', 1), ctx: 12 }, tool('shell', 'Bash', 'pnpm test')))
at(T5, s => ({
  ...push(s, { t: 'result', text: '✗ 1 failed · login keeps protocol-relative //evil.example', tone: 'bad' }),
  combo: 0, hearts: 3, pet: pose('fail'), bubble: 'fail',
  band: { kind: 'fail', text: '✗ 1 test failed', agents: s.band?.agents ?? 0 }, status: { tone: 'bad', text: '✗ 1 test failed' },
}))
at(T5 + BUBBLE_MS, s => ({ ...s, bubble: null }))
at(T6, s => file({ ...push(band(s, 'edit', 'Editing src/auth.ts', 1), tool('edit', 'Update', 'src/auth.ts', '+2 −1'),
  { t: 'diff', lines: [['add', 'if (next.startsWith("//")) return null']] }), combo: s.combo + 1 }, { name: 'src/auth.ts', kind: 'edit', add: 11, del: 3 }))
at(T7, s => file({ ...push(band(s, 'edit', 'Editing test/auth.test.ts', 1), tool('edit', 'Update', 'test/auth.test.ts', '+6 −0')), combo: s.combo + 1 },
  { name: 'test/auth.test.ts', kind: 'edit', add: 6, del: 0 }))
at(T8, s => push({ ...band(s, 'shell', 'Running pnpm test'), ctx: 15 }, tool('shell', 'Bash', 'pnpm test')))
at(T9, s => ({
  ...push(s, { t: 'result', text: '✓ 5 passed', tone: 'ok' }),
  combo: s.combo + 1, band: { kind: 'pass', text: '✓ 5 passed', agents: 0 }, status: { tone: 'done', text: '✓ Done' },
  pet: pose('done'), bubble: 'done',
}))
at(T9 + BUBBLE_MS, s => ({ ...s, bubble: null }))
at(T10, s => push(s, { t: 'say', text: 'Fixed. safeNext() rejects absolute and protocol-relative targets; the suite passes.' }))
at(T11, s => ({ ...s, bandOn: false }))
at(T12, s => ({ ...s, pet: pose('sleep') }))
at(T13, s => ({ ...s, pet: WANDER }))

export const SCRIPT: Step[] = steps.sort((a, b) => a.at - b.at)
export const LOOP_MS = SCRIPT.at(-1)!.at + 1200

const run = (upTo: number) => SCRIPT.reduce((s, st) => (st.at <= upTo ? st.apply(s) : s), initialState())
export const finalState = (): TermState => run(Infinity)
export const stateAt = (ms: number): TermState => run(ms % LOOP_MS)

type Clock = { now(): number; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }

export function runScript(onState: (s: TermState) => void, clock: Clock = { now: () => performance.now(), setTimeout, clearTimeout }): { stop(): void } {
  // Detached on purpose: window.setTimeout throws "Illegal invocation" when called with the clock as `this`.
  const { setTimeout: setTimer, clearTimeout: clearTimer } = clock
  let state = initialState(), i = 0, base = clock.now(), handle: ReturnType<typeof setTimeout> | undefined, stopped = false
  const wait = (due: number, fn: () => void) => { handle = setTimer(fn, Math.max(0, due - clock.now())) }
  // One timer at a time: stop() has a single handle to clear and a late tick can't emit twice.
  const tick = () => {
    if (stopped) return
    if (i < SCRIPT.length) {
      state = SCRIPT[i++]!.apply(state)
      onState(state)
    } else {
      state = initialState(); i = 0; base += LOOP_MS
      onState(state)
    }
    wait(base + (i < SCRIPT.length ? SCRIPT[i]!.at : LOOP_MS), tick)
  }
  onState(state)
  wait(base + SCRIPT[0]!.at, tick)
  return { stop() { stopped = true; if (handle !== undefined) clearTimer(handle) } }
}
