import type { EngineInterface, PaneOpenArgs, Register, RenderElement, Timer } from 'claude-code'
import type { Host } from './host.ts'
import { initialModel, normalizeModel, applyEvent, mergeCounts, isBusy, agentsRunning, type Model, type Ev } from './model.ts'
import { approvalLabel, dialogCall, modeAsksPerson, shortPath } from './events.ts'
import type { Theme } from './themes.ts'
import { resolveLook, cleanOverrides, DEFAULT_MIX, SPINNER_IDS, type Mix, type Look } from './packs.ts'
import { loadUserPacks } from './userpacks.ts'
import { PET_ROWS, type PetSetting, type PetId, type PetInput, type PetKind } from './pets.ts'
import { bubbleFor, BUBBLE_SETTINGS, daypart, fitsBubble, haikuLimit, haikuMaxTokens, haikuPrompt, kindWords, HaikuGate, HAIKU_MODEL, HAIKU_TIMEOUT_MS, sanitizeLine, type BubbleSetting, type BubbleVars, type HaikuContext, type Mood } from './bubbles.ts'
import { recordPass, overlays, localTime, localOffset, fridayDeploy, type EggStore } from './eggs.ts'
import { branchOf, gitBase, refreshCounts, serial } from './changes.ts'
import { loadTasks, taskListId } from './tasks.ts'
import { cacheHit, heaviest } from './ctxchart.ts'
import { tierFor, renderSegs } from './layout.tsx'
import { renderBand } from './band.tsx'
import { renderPane, bubbleBox, petStripCols, type PaneExtra, type PaneView, type TabId } from './pane.tsx'
import { spinnerWord, newTurnWord } from './restyle.ts'
import { styleRow } from './rows.tsx'
import { orbStateOf, usesOwnSpinner, checkedSpinnerProps } from './spinner.ts'
import type { PetClientProps } from './client/pet.tsx'
import type { OrbState } from './motion.ts'
import { statusText, writeStatusFile, drawsStatusLine, BACKUP_KEY, STATUS_DIR } from './statusline.ts'
import { parseFields, DEFAULT_FIELDS, type ColorMode, type FieldId } from './fields.ts'
import { DEFAULT_SETUP, parseSetup, type Setup } from './setup.ts'
import { runCommand, SUMMARY_LEAD, type Ctl } from './command.ts'
import { SHORT_TEXT, FULL_TEXT, parsePicked } from './help.ts'
import { renderHelp, renderConfigCard, renderHeader } from './helpcard.tsx'
import { loadUserThemes } from './userthemes.ts'
import { firstRun } from './firstrun.ts'
import { registerCopy, touchCopy, decide, unregisterCopy, pruneStatus, safeId, HEARTBEAT_MS } from './instances.ts'
import { staleToast, INSTALLED_FILE } from './update.ts'
import { syncPlugin } from './pluginsync.ts'

type Engine = EngineInterface
type SpinKey = { turnAt: number; detail: string; state: OrbState }

const BAND = { plugin: 'glowup', key: 'band' } as const
const PANE = { plugin: 'glowup', key: 'pane' } as const
const SPIN = { plugin: 'glowup', key: 'spinner' } as const
const PET = { plugin: 'glowup', key: 'pet' } as const
const HAIKU = { plugin: 'glowup', key: 'haiku' } as const

// Module state: one session per process. A hot reload starts it over, which only
// loses the in-flight session's view (settings and takeover state live in $.store).
let model: Model = initialModel()
let mix: Mix = DEFAULT_MIX
let look: Look = resolveLook(DEFAULT_MIX, {}, {}).look
let theme: Theme = look.theme
let pet: PetSetting = 'clawd'
let bubbles: BubbleSetting = 'on'
let view: PaneView = { tab: 'changes' }
let git: { root: string; base: string } | undefined
let cwd = ''
let configDir = ''
let home = ''
let dataHome = ''
let reducedMotion = false
let docked = false
// Where the surface seated the pane, learned from its last render: panes() does not say.
let panePlacement: 'dock' | 'inline' | undefined
// Calls between tool.call and its result: a permission dialog names its tool and input but not its id.
const flying = new Map<string, { tool: string; input: unknown }>()
let ticker: Timer | undefined
let refreshSeq = 0
const refreshQueue = serial()
let sessionId = ''
// off: another glowup copy is acting in this session (hooks/instances.ts)
let off = false
let guardSid = '', guardRoot = ''
let takenOver = false
let fields: readonly FieldId[] = DEFAULT_FIELDS
let setup: Setup = DEFAULT_SETUP
// the installer's value; `statusline fields default` returns to it
let configFields: readonly FieldId[] = DEFAULT_FIELDS
let colorMode: ColorMode = '256'
// The one 60 s clock: refreshes this copy's guard entry and rewrites the status file.
let beatTimer: Timer | undefined
let lastStatusLine: string | undefined
let spinKey: SpinKey = { turnAt: 0, detail: '', state: 'think' }
// Pet state, published to PET for the pane only; the band never reads it.
type Bubble = { text: string; mood: Mood; until: number }
type PetSnap = { input: PetInput; overlays: string[]; bubble?: Bubble; friday: boolean }
let bubble: Bubble | undefined
let lastTemplate: string | undefined
const haikuGate = new HaikuGate()
let haikuAbort: AbortController | undefined
let bubbleTimer: Timer | undefined
const BUBBLE_MS = 3000
let turnNo = 0
// Characters the last drawn pane can show in a bubble; 40 until a pane has drawn.
let bubbleCap = 40
// false in a plain -p run, where nobody sees a bubble
let interactive = true
let friday = false
let failed = false
let tzOffset = 0
let installed: number | undefined
let lastPet = ''
const PANE_OPEN: PaneOpenArgs = { id: 'glowup', title: 'glowup', focus: true, closeOnEscape: true }
const DOCK_OPEN: PaneOpenArgs = { id: 'glowup', title: 'glowup' }

function hostOf($: Engine): Host {
  return {
    run: async (argv, env) => { const r = await $.process.run(argv, env ? { env } : undefined); return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr } },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDir: async path => (await $.fs.list(path)).map(e => e.name),
    listFiles: async path => (await $.fs.list(path)).map(e => ({ name: e.name, size: e.size })),
    fetchText: url => new Promise((resolve, reject) => {
      // a stalled server must not hold a /glowup command open
      const timer = $.clock.after(10_000, () => reject(new Error('timed out after 10 s')))
      // $.http.fetch reads the whole body, so the 64 KB cap is the callers' text.length check
      $.http.fetch(url).then(r => { timer.cancel(); resolve({ ok: r.ok, status: r.status, text: r.text }) },
        err => { timer.cancel(); reject(err) })
    }),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    projectStatusLine: async () =>
      (await $.settings.read({ source: 'project' })).statusLine !== undefined ||
      (await $.settings.read({ source: 'local' })).statusLine !== undefined,
    configDir,
    dataHome,
    home,
  }
}

// The takeover script falls back to the person's own command once this file is
// 10 minutes old, so a quiet session still rewrites it every minute.
function writeStatus($: Engine, force: boolean) {
  const line = statusText(model, theme, { fields, now: Date.now(), tzOffset, color: colorMode, meter: setup.meter })
  if (!takenOver || !sessionId || (!force && line === lastStatusLine)) return
  lastStatusLine = line
  void writeStatusFile(hostOf($), sessionId, line).catch(() => {})
}
// Versions already announced this session; a hot reload starts it over, which only repeats a toast.
const staleShown = new Set<string>()
async function checkStale($: Engine) {
  if (off || !interactive) return
  try {
    const text = staleToast(staleShown, JSON.parse(await hostOf($).readFile(INSTALLED_FILE(configDir))), guardRoot, configDir)
    if (text) $.ui.toast(text)
  } catch {}
}
function startBeat($: Engine) {
  beatTimer?.cancel()
  beatTimer = $.clock.every(HEARTBEAT_MS, () => {
    if (guardSid) void touchCopy(hostOf($), guardSid, guardRoot, Date.now()).catch(() => {})
    writeStatus($, true)
    void checkStale($)
  })
}
// A winning copy whose store has no backup (the takeover was made by another copy
// or an earlier install) still owns the file settings.json points at.
async function syncTakeover($: Engine) {
  // the first-run timer can fire after recheckGuard turned this copy off
  if (off) return
  takenOver = (await hostOf($).storeGet(BACKUP_KEY)) !== undefined || await drawsStatusLine(hostOf($))
  writeStatus($, true)
  $.ui.status(statusEntry())
}

// The engine pins this entry as a "⚠ glowup:" notice, which reads as an error
// when it never goes away; the takeover's status line already says the same.
const statusEntry = () => !takenOver && isBusy(model) ? (statusText(model, theme, { fields, tzOffset }) || undefined) : undefined

// The model's combo moves on after a reply is drawn, and the engine redraws old rows on every
// invalidate, so each reply keeps the count it first drew with.
const xpByMessage = new Map<string, number>()
function xpFor(messageId: string, isFirstOfReply: boolean): number | undefined {
  if (!look.rowFlags.xp || !isFirstOfReply) return undefined
  if (!xpByMessage.has(messageId)) xpByMessage.set(messageId, model.combo)
  return xpByMessage.get(messageId)
}

const petOn = () => pet !== 'off' && !reducedMotion

const PET_KINDS: readonly string[] = ['read', 'search', 'edit', 'shell', 'agent', 'plan']
// Hats sit above the canvas; held and side outfits fit inside it.
const HEAD_OUTFITS = ['santa', 'party', 'nightcap']
// Running subagents are work even when the main loop only waits on them or its turn already ended.
function petKind(): PetKind | undefined {
  const own = model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind as PetKind : 'think') : undefined
  return agentsRunning(model) && (own === undefined || own === 'think' || own === 'agent') ? 'agent' : own
}
const petInput = (): PetInput => ({
  working: isBusy(model),
  sleepMs: setup.pet.sleepMs,
  pantAt: setup.meter.danger,
  kind: petKind(),
  needsYou: !!model.needsYou,
  lastTest: model.lastTest,
  doneAt: model.doneAt,
  doneOk: model.act.tone === 'pass' && !model.working,
  actAt: model.actAt,
  agents: model.agents.filter(a => a.state === 'running').length,
  compactAt: model.compactAt,
  ctx: model.ctxPercent,
})
// Through JSON because Client props refuse undefined fields.
function petSnap(): PetSnap {
  const now = Date.now()
  return JSON.parse(JSON.stringify({
    input: petInput(),
    overlays: overlays(localTime(now, tzOffset), installed === undefined ? undefined : localTime(installed, tzOffset), friday, failed),
    bubble,
    friday,
  }))
}
// Writes only when the pet's picture would change, so a 1 s tick costs the pane nothing.
function publishPet($: Engine) {
  const snap = petSnap()
  const key = JSON.stringify(snap)
  if (key === lastPet) return
  lastPet = key
  void $.state.set(PET, { ...snap, at: Date.now() })
}

// Writes the live data the band and the pane draw from; only their readers redraw.
function publish($: Engine) {
  const at = Date.now()
  void $.state.set(BAND, { model, at })
  void $.state.set(PANE, { model, view, at })
  publishPet($)
}

function cancelHaiku() {
  haikuAbort?.abort(); haikuAbort = undefined
  haikuGate.reset()
}
// The template is already up; Haiku's line replaces it only if it lands while that bubble is still showing.
// `ctx` was read from the model in say() before its first await: a tool that starts meanwhile must not change what Haiku is told.
async function askHaiku($: Engine, mine: Bubble, ctx: HaikuContext) {
  if (bubbles !== 'haiku' || !interactive || !petOn()) return
  let now: number, lastAt: number
  try {
    now = await $.clock.now()
    // in $.state, not a module variable: a hot reload would otherwise allow one more call in the same window
    lastAt = ((await $.state.get(HAIKU)).value as { lastAt: number } | undefined)?.lastAt ?? -Infinity
  } catch { return }
  if (!haikuGate.take(turnNo, now, lastAt)) return
  void $.state.set(HAIKU, { lastAt: now })
  const stop = new AbortController()
  haikuAbort = stop
  // the abort race below is what ends a call the engine never settles; timeoutMs only bounds the request itself
  const timer = $.clock.after(HAIKU_TIMEOUT_MS, () => stop.abort())
  const limit = ctx.limit ?? bubbleCap
  try {
    const { system, prompt } = haikuPrompt(ctx)
    const maxTokens = haikuMaxTokens(limit)
    const aborted = new Promise<undefined>(r => stop.signal.addEventListener('abort', () => r(undefined)))
    const r = await Promise.race([$.model.complete({ model: HAIKU_MODEL, system, prompt, maxTokens, effort: 'low', timeoutMs: HAIKU_TIMEOUT_MS }, { signal: stop.signal }), aborted])
    if (!r) { $.ui.log('haiku bubble: timed out or cancelled', { to: 'debug' }); return }
    if (!r.isAnswered) { $.ui.log(`haiku bubble: ${r.reason}`, { to: 'debug' }); return }
    // the result has no stop reason; output tokens at the cap mean the reply was cut off
    if (r.usage?.output_tokens >= maxTokens) { $.ui.log('haiku bubble: hit the token cap, template kept', { to: 'debug' }); return }
    const text = sanitizeLine(r.text)
    if (text && !fitsBubble(text, limit)) { $.ui.log('haiku bubble: over the limit, template kept', { to: 'debug' }); return }
    if (!text || off || bubbles !== 'haiku' || !petOn() || bubble !== mine) return
    mine.text = text
    armBubble($, mine)
    publishPet($)
  } catch (err) {
    $.ui.log(`haiku bubble failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    timer.cancel()
    if (haikuAbort === stop) { haikuAbort = undefined; haikuGate.done() }
  }
}

// One clear timer for the one bubble: arming again (a new bubble, or Haiku's line landing)
// replaces it, and the bubble then shows for the full BUBBLE_MS from that moment.
function armBubble($: Engine, mine: Bubble) {
  mine.until = Date.now() + BUBBLE_MS
  bubbleTimer?.cancel()
  bubbleTimer = $.clock.after(BUBBLE_MS + 100, () => {
    bubbleTimer = undefined
    if (bubble === mine) { bubble = undefined; publishPet($) }
  })
}

async function say($: Engine, mood: Mood, vars: BubbleVars) {
  if (bubbles === 'off' || !petOn()) return
  // Kind words only, never the act's label: it holds commands, paths and patterns.
  const ctx: HaikuContext = {
    mood,
    pose: model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind! : 'think') : 'idle',
    label: mood === 'needs-you' ? 'waiting for approval' : model.working ? kindWords(model.act.kind) : undefined,
    tests: mood === 'fail' ? (vars.n === undefined ? 'failed' : `failed ${vars.n}`) : model.lastTest ? (model.lastTest.passed ? 'passed' : 'failed') : undefined,
    daypart: daypart(localTime(Date.now(), tzOffset).hour),
    limit: bubbleCap,
  }
  try {
    // a closed pane shows nobody the bubble
    if (!(await $.ui.panes()).some(p => p.id === 'glowup' && p.isShown)) return
  } catch { return }
  const line = bubbleFor(mood, vars, lastTemplate, Math.random)
  lastTemplate = line.template
  const mine: Bubble = { text: line.text, mood, until: 0 }
  bubble = mine
  armBubble($, mine)
  publishPet($)
  void askHaiku($, mine, ctx)
}
function moodOf(old: Model, now: Model, ev: Ev): { mood: Mood; vars: BubbleVars } | undefined {
  if (now.needsYou && !old.needsYou) return { mood: 'needs-you', vars: { command: now.needsYou.what.replace(/^approve /, '').split(/\s+/)[0] } }
  if (now.lastTest && !now.lastTest.passed && now.lastTest.at !== old.lastTest?.at) {
    const n = /(\d+) tests? failed/.exec(now.act.label)?.[1]
    return { mood: 'fail', vars: { n: n === undefined ? undefined : Number(n) } }
  }
  if (ev.type === 'turn-done' && ev.reason === 'answer') return { mood: 'done', vars: { file: now.files[0] && shortPath(now.files[0].path) } }
}
function redraw($: Engine) {
  publish($)
  $.ui.status(statusEntry())
  writeStatus($, false)
}
// The one invalidate: the look changed, so every render site draws again.
function relook($: Engine) {
  $.ui.invalidate('ui.render')
  publish($)
}
// Resolves the mix against the packs and themes on disk. Returns the errors it toasted.
async function loadLook($: Engine): Promise<string[]> {
  const host = hostOf($)
  const r = resolveLook(mix, await loadUserPacks(host), await loadUserThemes(host))
  look = r.look
  theme = look.theme
  if (r.errors.length) $.ui.toast(r.errors.join('\n'))
  relook($)
  return r.errors
}
// Elapsed times and agent spinners change with no event behind them, and
// background subagents keep running after the main turn ends.
function syncTicker($: Engine) {
  if (isBusy(model)) ticker ??= $.clock.every(1000, () => { redraw($); void settleTeammates($) })
  else { ticker?.cancel(); ticker = undefined }
}
// A named Agent call starts an in-process teammate, whose loop raises no
// turn.complete of its own: agent.list() going idle is the only sign it is done.
async function settleTeammates($: Engine) {
  if (!agentsRunning(model)) return
  try {
    const status = new Map((await $.agent.list()).map(a => [a.id, a.status]))
    for (const a of model.agents) {
      const s = a.agentId === undefined ? undefined : status.get(a.agentId)
      if (a.state === 'running' && s !== undefined && s !== 'running') feed($, { type: 'agent-done', at: Date.now(), agentId: a.agentId! })
    }
  } catch {}
}
function feed($: Engine, ev: Ev) {
  const old = model
  model = applyEvent(model, ev)
  syncTicker($)
  redraw($)
  const said = moodOf(old, model, ev)
  if (said) void say($, said.mood, said.vars)
  // Only the spinner's readers redraw, and only when what it shows changes.
  const next: SpinKey = { turnAt: model.turnAt ?? 0, detail: model.act.label, state: orbStateOf(model) }
  if (next.turnAt !== spinKey.turnAt || next.detail !== spinKey.detail || next.state !== spinKey.state) {
    spinKey = next
    void $.state.set(SPIN, { ...next, at: Date.now() })
  }
}

async function togglePane($: Engine): Promise<string> {
  const open = (await $.ui.panes()).find(p => p.id === 'glowup')
  if (open?.isShown) { await $.ui.close({ id: 'glowup' }); return 'glowup pane closed' }
  const r = await $.ui.open(PANE_OPEN)
  return r.isPlaced ? 'glowup pane open (Esc closes it)' : `glowup pane waits: ${r.reason}`
}

// Not awaited by callers: git must not hold up a tool result. A refresh that
// started before adoptSession must not land in the new session's model.
function refresh($: Engine) {
  refreshQueue(async () => {
    const seq = refreshSeq
    const files = await refreshCounts(hostOf($), model.files, git, Date.now())
    if (seq !== refreshSeq) return
    model = mergeCounts(model, files)
    redraw($)
    void readBranch($)
  })
}

async function readBranch($: Engine) {
  if (!fields.includes('branch') || !cwd) return
  const seq = refreshSeq
  const branch = await branchOf(hostOf($), cwd)
  if (seq === refreshSeq) feed($, { type: 'branch', branch })
}

async function readSessionInfo($: Engine) {
  const seq = refreshSeq
  const [modelName, root] = await Promise.all([
    $.session.model().catch(() => undefined),
    $.session.root().catch(() => undefined),
  ])
  if (seq === refreshSeq) feed($, { type: 'session-info', modelName: modelName || undefined, root: root || undefined })
}

// usage() has no percent before the first response of a session, hence the guard.
// The Plan tab's breakdown is fetched here and cached, not on every pane render
// (the ticker redraws each second).
async function feedContext($: Engine) {
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    feed($, { type: 'usage', limits: u.rateLimits ?? [], costUsd: u.cost?.usd })
    const b = u.context.breakdown
    view = {
      ...view,
      categories: b?.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      maxTokens: b?.maxTokens,
      ctx: b && { autoCompact: b.isAutoCompactEnabled, threshold: b.autoCompactThreshold, window: u.context.window, heavy: heaviest(b), cacheHit: cacheHit(b.apiUsage) },
    }
    if (u.context.percent !== undefined) feed($, { type: 'context', percent: u.context.percent })
    else publish($)
  } catch {}
}

// Claude Code's task list outlives the session, so the plan starts from its files and
// is read again after each main-loop TaskCreate/TaskUpdate (debounced: a burst of calls is one read).
let planTimer: Timer | undefined
async function loadPlan($: Engine) {
  try {
    const id = taskListId(await $.env.get('CLAUDE_CODE_TASK_LIST_ID'), cwd)
    const plan = await loadTasks(hostOf($), id)
    if (plan.length) feed($, { type: 'plan-load', plan })
  } catch {}
}
function schedulePlan($: Engine) {
  planTimer?.cancel()
  planTimer = $.clock.after(150, () => { planTimer = undefined; void loadPlan($) })
}

// A new session id means a new conversation: nothing from the old one carries over.
async function adoptSession($: Engine, endedId: string) {
  const id = await $.session.id()
  const { limits } = model
  model = { ...initialModel(), limits }
  view = { tab: 'changes' }
  bubble = undefined
  xpByMessage.clear()
  cancelHaiku()
  friday = false
  failed = false
  lastStatusLine = undefined
  refreshSeq++
  // at session.end the id may still be the ending one; turn.start re-checks
  sessionId = id === endedId ? '' : id
  git = await gitBase(hostOf($), cwd)
  void readBranch($)
  void readSessionInfo($)
  syncTicker($)
  redraw($)
  void loadPlan($)
}

// A second session.start (or /clear) while the dialog is open must not stack another.
let asking = false
async function askFirstRun($: Engine) {
  if (asking) return
  asking = true
  try {
    const toast = await firstRun(hostOf($), q => $.ui.ask(q, ['Yes', 'No']).then(label => label, () => undefined), Date.now())
    if (toast) $.ui.toast(toast)
    await syncTakeover($)
  } catch (err) {
    $.ui.log(`first run failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    asking = false
  }
}

const PETS: readonly PetSetting[] = ['clawd', 'clawd-shiny', 'off']
const BUBBLES = BUBBLE_SETTINGS

// The store wins only once a command wrote it. Without a stored mix, the
// 0.1 settings migrate in memory; only a command writes the result back.
async function initialMix(host: Host, options: Readonly<Record<string, unknown>>): Promise<Mix> {
  const stored = await host.storeGet('mix') as Partial<Mix> | undefined
  if (stored && typeof stored.colors === 'string' && typeof stored.motion === 'string') {
    const overrides = cleanOverrides(stored.overrides)
    return { colors: stored.colors, motion: stored.motion, theme: typeof stored.theme === 'string' ? stored.theme : undefined, spinner: typeof stored.spinner === 'string' ? stored.spinner : undefined, ...(overrides && { overrides }) }
  }
  const pack = typeof options.pack === 'string' && options.pack ? options.pack : DEFAULT_MIX.colors
  const storedTheme = await host.storeGet('theme')
  const theme = typeof storedTheme === 'string' ? storedTheme : typeof options.theme === 'string' && options.theme !== 'classic' ? options.theme : undefined
  // "pack" is the userConfig default and means the pack's own spinner; an id this build lacks is ignored like a bad pet.
  const spinner = typeof options.spinner === 'string' && (SPINNER_IDS as readonly string[]).includes(options.spinner) ? options.spinner : undefined
  return { ...DEFAULT_MIX, colors: pack, motion: pack, theme, spinner }
}

function ctlOf($: Engine): Ctl {
  return {
    current: () => theme.name,
    setTheme: async name => { mix = { ...mix, theme: name }; await loadLook($) },
    togglePane: () => togglePane($),
    setMotion: reduced => { reducedMotion = reduced; relook($) },
    // ask rejects when the person dismisses the dialog; that counts as No
    confirm: async question => (await $.ui.ask(question, ['Yes', 'No']).catch(() => 'No')) === 'Yes',
    mix: () => mix,
    setMix: async m => { mix = m; return loadLook($) },
    pet: () => pet,
    setPet: p => { pet = p; relook($) },
    bubbles: () => bubbles,
    setBubbles: b => { bubbles = b; if (b !== 'haiku') cancelHaiku(); relook($) },
    reduced: () => reducedMotion,
    fields: () => fields,
    setFields: f => {
      fields = f ?? configFields
      void readBranch($)
      writeStatus($, true)
      $.ui.status(statusEntry())
    },
    setup: () => setup,
    setSetup: s => { setup = s; relook($); writeStatus($, true); publishPet($) },
    ask: (question, o) => $.ui.ask(question, o),
    // surfaces() is empty only in a plain -p run
    headless: async () => (await $.session.surfaces().catch(() => ['terminal'])).length === 0,
  }
}

declare function setTimeout(fn: () => void, ms: number): unknown
// Long enough for a copy that started at the same moment to write its entry.
const SETTLE_MS = 150

function goOff($: Engine, winner: string) {
  off = true
  cancelHaiku()
  ticker?.cancel(); ticker = undefined
  beatTimer?.cancel(); beatTimer = undefined
  planTimer?.cancel(); planTimer = undefined
  bubbleTimer?.cancel(); bubbleTimer = undefined
  takenOver = false
  $.ui.status(undefined)
  $.ui.toast(`glowup is loaded twice (${guardRoot} and ${winner}); this copy is off. Disable one: claude plugin disable glowup@glowup`)
}

// A copy that registered after our session.start check, or a /clear that gave the session a
// new id, can change the answer. Only active -> off: a copy that lost at session.start never
// ran its init, so it cannot be switched back on. Returns true when this copy went off.
async function recheckGuard($: Engine, id: string): Promise<boolean> {
  const sid = safeId(id)
  if (!sid || !guardRoot) return false
  try {
    const host = hostOf($)
    if (sid !== guardSid) {
      guardSid = sid
      await registerCopy(host, sid, guardRoot, Date.now())
    }
    const d = await decide(host, sid, guardRoot, Date.now())
    if (d.active) return false
    goOff($, d.winner)
    return true
  } catch { return false }
}

// The loader reads `on("<event>", hook)` literally, so no wrapper can gate the hooks:
// each one opens with `if (off) return next(e)`. session.start and session.end run
// the guard and its cleanup themselves.
export const register: Register = (on, options) => {
  reducedMotion = options.reducedMotion === true

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    interactive = e.isInteractive
    cancelHaiku()
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    home = (await $.env.get('HOME')) ?? ''
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
    const xdg = await $.env.get('XDG_DATA_HOME')
    dataHome = xdg?.startsWith('/') ? xdg : `${home}/.local/share`
    const host = hostOf($)
    off = false
    guardSid = safeId(await $.session.id())
    guardRoot = $.plugin.root
    if (guardSid) {
      try {
        await registerCopy(host, guardSid, guardRoot, Date.now())
        await new Promise<void>(r => setTimeout(r, SETTLE_MS))
        const d = await decide(host, guardSid, guardRoot, Date.now())
        if (!d.active) {
          goOff($, d.winner)
          return next(e)
        }
        void pruneStatus(host, STATUS_DIR(configDir))
      } catch (err) {
        // better two copies than none: a guard that cannot read its files steps aside
        $.ui.log(`two-copies guard failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    startBeat($)
    void checkStale($)
    await $.command.register({ name: 'glowup', description: 'Themes, the glowup pane and status line', argumentHint: 'config|theme|pack|spinner|color|import|export|pet|bubbles|pane|motion|statusline on|fields|setup|restore' })
    mix = await initialMix(host, options)
    const storedPet = await host.storeGet('pet')
    const wantPet = PETS.includes(storedPet as PetSetting) ? storedPet as PetSetting : PETS.includes(options.pet as PetSetting) ? options.pet as PetSetting : 'clawd'
    const eggs = await host.storeGet('eggs') as EggStore | undefined
    pet = wantPet === 'clawd-shiny' && eggs?.shinyAt === undefined ? 'clawd' : wantPet
    const storedBubbles = await host.storeGet('bubbles')
    bubbles = BUBBLES.includes(storedBubbles as BubbleSetting) ? storedBubbles as BubbleSetting : BUBBLES.includes(options.bubbles as BubbleSetting) ? options.bubbles as BubbleSetting : 'on'
    await loadLook($)
    const motion = await host.storeGet('reducedMotion')
    if (typeof motion === 'boolean') reducedMotion = motion
    sessionId = await $.session.id()
    // the sandbox may run in UTC, where getTimezoneOffset() says 0 for everyone
    const tzo = new Date().getTimezoneOffset()
    let zone: string | undefined
    if (tzo === 0) { try { zone = (await host.run(['date', '+%z'])).stdout } catch {} }
    tzOffset = localOffset(tzo, zone)
    const at = await host.storeGet('installed-at')
    installed = typeof at === 'number' ? at : undefined
    configFields = parseFields(options.statusline) ?? DEFAULT_FIELDS
    fields = parseFields(await host.storeGet('statusline')) ?? configFields
    const parsed = parseSetup(await host.storeGet('setup'))
    setup = parsed.setup
    if (parsed.notices.length) $.ui.toast(`glowup setup: ${parsed.notices.join('; ')}`)
    // After the saved choices are loaded: the commands read and extend them (a spinner is added to
    // the current mix), and write the new choice to the store by the same path a typed command does.
    try {
      const toast = await syncPlugin(host, options, cmd => runCommand(host, cmd, ctlOf($)))
      if (toast) $.ui.toast(toast)
    } catch (err) {
      $.ui.log(`/plugin sync failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    const colorterm = await $.env.get('COLORTERM')
    colorMode = colorterm === 'truecolor' || colorterm === '24bit' ? 'truecolor' : '256'
    await syncTakeover($)
    git = await gitBase(host, cwd)
    void readBranch($)
    void readSessionInfo($)
    void loadPlan($)
    // a beat after launch, so the dialog does not open over the startup frame
    if (e.isInteractive) $.clock.after(1500, () => void askFirstRun($))
    // a hot reload restarts this module; the live band and pane must not keep an old snapshot
    publish($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (off) return next(e)
    // belt and braces: session.end may have run before the new id was visible
    const id = await $.session.id()
    if (await recheckGuard($, id)) return next(e)
    if (id !== sessionId) await adoptSession($, sessionId)
    newTurnWord()
    turnNo++
    friday = false
    failed = false
    feed($, { type: 'turn-start', at: Date.now() })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (off) return next(e)
    // without an id the call cannot be matched to its end (an Agent row would never close)
    if (!e.tool_use_id) return next(e)
    const input = e as unknown as Record<string, unknown>
    const toolUseId = e.tool_use_id
    if (!e.agentId && e.tool === 'Bash' && typeof input.command === 'string' && fridayDeploy(input.command, localTime(await $.clock.now(), tzOffset))) friday = true
    feed($, { type: 'tool-start', at: Date.now(), tool: e.tool, toolUseId, agentId: e.agentId, input })
    const { tool: _t, tool_use_id: _i, agentId: _a, consent: _c, ...args } = input
    flying.set(toolUseId, { tool: e.tool, input: args })
    let ran
    try { ran = await next(e) } finally { flying.delete(toolUseId) }
    const denied = ran.deny !== undefined
    const result = denied || ran.isError ? undefined : ran.result as unknown as { task?: { id?: unknown }; totalTokens?: unknown; type?: unknown } | undefined
    const endAt = Date.now()
    feed($, {
      type: 'tool-end', at: endAt, tool: e.tool, toolUseId, agentId: e.agentId, input,
      isError: denied || ran.isError === true, text: ran.text ?? ran.deny ?? '',
      resultTaskId: e.tool === 'TaskCreate' && result?.task?.id !== undefined ? String(result.task.id) : undefined,
      agentTokens: e.tool === 'Agent' && typeof result?.totalTokens === 'number' ? result.totalTokens : undefined,
      writeType: e.tool === 'Write' && (result?.type === 'create' || result?.type === 'update') ? result.type : undefined,
    })
    if (!e.agentId && model.lastTest?.at === endAt && !model.lastTest.passed) {
      failed = true
      publishPet($)
    }
    if (!e.agentId && model.lastTest?.at === endAt && model.lastTest.passed) {
      try {
        const r = recordPass(await hostOf($).storeGet('eggs') as EggStore | undefined, Date.now())
        await hostOf($).storeSet('eggs', r.next)
        if (r.unlocked) $.ui.toast('Clawd went shiny. /glowup pet clawd-shiny (see him in /glowup pane)')
      } catch (err) {
        $.ui.log(`pass counter failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    if (!denied && !e.agentId && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit' || e.tool === 'Bash')) refresh($)
    if (!e.agentId) void feedContext($)
    if (!denied && !e.agentId && (e.tool === 'TaskCreate' || e.tool === 'TaskUpdate')) schedulePlan($)
    return ran
  })

  // The one signal that a dialog is on screen. tool.check's `ask` is not it: that hands the call
  // to the mode's decider, and in auto mode the classifier answers with no one asked.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (off) return next(e)
    // A hook below may answer the request itself, and then no dialog opens.
    const r = await next(e)
    if (!r?.decision && modeAsksPerson(e.permission_mode)) {
      const id = dialogCall(flying, e.tool_name, e.tool_input)
      if (id) feed($, { type: 'needs-you', at: Date.now(), toolUseId: id, what: approvalLabel(e.tool_name, (e.tool_input ?? {}) as Record<string, unknown>) })
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    if (off) return next(e)
    const r = await next(e)
    if (r.agentId && e.tool_use_id) feed($, { type: 'agent-bind', toolUseId: e.tool_use_id, agentId: r.agentId })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (off) return next(e)
    // the ticker would redraw through the whole wait for next(); feed restarts it
    // while background subagents still run
    if (!e.agentId) { ticker?.cancel(); ticker = undefined }
    const r = await next(e)
    if (e.agentId) {
      // A background Agent call returns before the run, so its result carries no totalTokens.
      const u = e.usage
      const tokens = u ? u.input_tokens + u.output_tokens + u.cache_creation_input_tokens : undefined
      feed($, { type: 'agent-done', at: Date.now(), agentId: e.agentId, tokens })
      refresh($)
      return r
    }
    feed($, { type: 'turn-done', at: Date.now(), reason: e.reason })
    refresh($)
    await feedContext($)
    void readSessionInfo($)
    // one more redraw after the linger so the band folds away
    $.clock.after(1600, () => publish($))
    return r
  })

  on('session.compact', async ($, e, next) => {
    if (off) return next(e)
    const r = await next(e)
    if (e.agentId || e.trigger === 'precompute' || 'skip' in r) return r
    // usage().context.percent is absent until the next response, so a manual
    // /compact would leave the hearts empty; derive it from the result.
    const u = await $.session.usage()
    const percent = u.context.percent ?? (r.tokensAfter !== undefined && u.context.window > 0 ? Math.round(r.tokensAfter / u.context.window * 100) : 0)
    feed($, { type: 'compact', at: Date.now() })
    feed($, { type: 'context', percent })
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (off) return next(e)
    feed($, { type: 'usage', limits: e.rateLimits, costUsd: e.cost?.usd })
    return next(e)
  })

  // /clear and resume continue the process under a new session id with no session.start.
  on('session.end', async ($, e, next) => {
    if (guardSid) await unregisterCopy(hostOf($), guardSid, guardRoot)
    if (off) return next(e)
    if (e.reason === 'clear' || e.reason === 'resume') await adoptSession($, e.sessionId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (off) return next(e)
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    // Asked once. Claude Code places it unasked only from 144 columns (110 once the
    // person has opened it); narrower, it waits and the band shows instead.
    if (e.viewport?.isFullscreen === true && !docked) { docked = true; void $.ui.open(DOCK_OPEN).catch(() => {}) }
    const panes = await $.ui.panes()
    const paneShown = panes.some(p => p.id === 'glowup' && p.isShown && p.isPlaced)
    // Only a docked pane shows the status the band would repeat; an inline one is a short drawer.
    const tier = tierFor(e.props.bodyColumns, paneShown && panePlacement === 'dock')
    const below = await next(e)
    const els = $.ui.resolve(e)
    const live = (await $.state.get(BAND)).value as { model: Model } | undefined
    const mine = renderBand(els, live ? normalizeModel(live.model) : model, theme, e.props.bodyColumns, tier, Date.now(), { look })
    if (!mine) return below
    // other mods draw bands here too: stack ours on top instead of replacing theirs
    const { Box } = els
    return <Box flexDirection="column">{mine}{below}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: 'glowup' }, async ($, e, next) => {
    if (off) return next(e)
    // a render hook cannot write state: publish after the draw
    if (panePlacement !== e.props.placement) { panePlacement = e.props.placement; $.clock.after(0, () => publish($)) }
    const live = (await $.state.get(PANE)).value as { model: Model; view: PaneView } | undefined
    const compact = e.props.placement === 'inline' && e.props.bodyColumns < 80
    const box = bubbleBox(e.props.bodyColumns, compact)
    bubbleCap = haikuLimit(box.cols, box.lines)
    const v: PaneView = { ...(live?.view ?? view), reduced: reducedMotion }
    const els = $.ui.resolve(e)
    // the look always applies; the pet and its words only while he is on
    const pid = pet, red = reducedMotion
    let extra: PaneExtra = { look }
    if (pid !== 'off' && !red && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const snap = ((await $.state.get(PET)).value as PetSnap | undefined) ?? petSnap()
      const { Client } = $.ui.resolve(e)
      const props: PetClientProps = { pet: pid as PetId, input: snap.input, overlays: snap.overlays, reduced: red, compact, width: petStripCols(e.props.bodyColumns) }
      // unsized, the region shrinks to the sprite and surface.columns leaves no room to walk
      const node = <Client key="glowup-pet" module="./client/pet.tsx" props={props} width={compact ? undefined : props.width} />
      const bubbleNow = snap.bubble && snap.bubble.until > Date.now() ? snap.bubble : undefined
      extra = { look, pet: { id: pid as PetId, node, rows: snap.overlays.some(o => HEAD_OUTFITS.includes(o)) ? PET_ROWS + 2 : undefined }, bubble: bubbleNow, friday: snap.friday }
    }
    // the engine scrolls the whole body, which would carry the pet off with a long tab: budget the tab to bodyRows instead
    extra = { ...extra, bodyRows: e.props.scroll.bodyRows, onScroll: (offset: number) => { view = { ...view, offset }; publish($) } }
    if (e.props.placement === 'dock') extra = { ...extra, minRows: e.props.scroll.bodyRows }
    return renderPane(els, live ? normalizeModel(live.model) : model, theme, { ...v, meter: setup.meter }, e.props.bodyColumns, compact, Date.now(), (id: TabId) => {
      view = { ...view, tab: id, offset: 0 }
      publish($)
      if (id === 'plan') void feedContext($)
    }, extra)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (off) return next(e)
    const word = spinnerWord(theme, e.props.word, reducedMotion)
    if (!usesOwnSpinner(look, reducedMotion, e.props.message) || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next({ ...e, props: { ...e.props, word } })
    }
    try {
      const live = (await $.state.get(SPIN)).value
      const input = { word, turnAt: live?.turnAt || Date.now(), detail: live?.detail ?? model.act.label, state: (live?.state ?? orbStateOf(model)) as OrbState }
      const props = checkedSpinnerProps(look, input, reducedMotion, Date.now())
      if (!props) return next(e)
      const { Client } = $.ui.resolve(e)
      return <Client key="glowup-spinner" module="./client/spinner.tsx" props={props} />
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    return styleRow($.ui.resolve(e), look, { site: 'UserMessage', text: p.text, isExpanded: p.isExpanded, own: p.origin.kind === 'composer' && !p.from && !p.task }, row) as RenderElement
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    return styleRow($.ui.resolve(e), look, { site: 'AssistantMessage', isFirstOfReply: e.props.isFirstOfReply, xp: xpFor(e.requestId, e.props.isFirstOfReply) }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    return styleRow($.ui.resolve(e), look, { site: 'ToolUse', tool: p.tool, input: p.input, isRunning: p.isRunning, isErrored: p.isErrored, isInterrupted: p.isInterrupted }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    return styleRow($.ui.resolve(e), look, { site: 'ToolResult' }, row) as RenderElement
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (off) return next(e)
    const p = e.props
    if ((e.surface !== 'terminal' && e.surface !== 'desktop') || p.command !== 'glowup' || p.isErrored) return next(e)
    // Matched on the exact text the command printed, so an error or a changed answer stays the engine's row.
    const args = p.args.trim()
    if ((args === '' || args === 'help') && p.text === SHORT_TEXT) return renderHelp($.ui.resolve(e), look, false)
    if (args === 'help all' && p.text === FULL_TEXT) return renderHelp($.ui.resolve(e), look, true)
    if (args !== 'config' || !p.text.startsWith(SUMMARY_LEAD)) return next(e)
    // The row is history: draw the pack it names, not whatever look is on now. A render hook must not
    // read disk, so a user pack resolves only while it is the live one.
    const picked = parsePicked(p.text)
    const [colors = '', motion = colors] = p.text.slice(SUMMARY_LEAD.length).split('\n')[0]!.split(' · ')[0]!.split('/')
    const live = !mix.theme && mix.colors === colors && mix.motion === motion
    const r = live ? { look, errors: [] } : resolveLook({ colors, motion }, {}, {})
    if (r.errors.length) return next(e)
    const els = $.ui.resolve(e)
    // a row from before the card was one line; it keeps its header
    if (!picked) {
      const { Box } = els
      return <Box flexDirection="column">{renderHeader(els, r.look)}{renderSegs(els, [{ text: p.text, color: r.look.theme.colors.text }], 'summary')}</Box>
    }
    return renderConfigCard(els, r.look, picked)
  })

  on('command.run', { command: 'glowup' }, async ($, e, next) => {
    if (off) return next(e)
    const text = await runCommand(hostOf($), e.args, ctlOf($))
    await syncTakeover($)
    return { text }
  })
}
