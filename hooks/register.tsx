import type { EngineInterface, PaneOpenArgs, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { Host } from './host.ts'
import { initialModel, normalizeModel, applyEvent, mergeCounts, isBusy, agentsRunning, type Model, type Ev } from './model.ts'
import { approvalLabel, dialogCall, modeAsksPerson } from './events.ts'
import { shown, type Theme } from './themes.ts'
import { resolveLook, cleanOverrides, exportMix, exportName, DEFAULT_MIX, SPINNER_IDS, type Mix, type Look } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { loadUserPacks, SAFE_NAME } from './userpacks.ts'
import { BUILTIN_SHEETS, CLAWD_SHEET, eggSheet, stripRows, type PetSetting, type PetInput, type PetKind, type PetSheet } from './pets.ts'
import { loadUserPet, userPetNames, PET_DIR } from './userpets.ts'
import { bubbleFor, BUBBLE_SETTINGS, daypart, fitsBubble, haikuLimit, haikuMaxTokens, haikuPrompt, kindWords, HaikuGate, HAIKU_MODEL, HAIKU_TIMEOUT_MS, sanitizeLine, speaks, voiceFor, type BubbleSetting, type BubbleVars, type HaikuContext } from './bubbles.ts'
import { linesFor, pool, flavoursOf, type Moment } from './lines.ts'
import { momentOf } from './moments.ts'
import { turnXp, isCommitCommand, levelUp, levelOf, parseLevelStore, levelStore } from './levels.ts'
import { recordPass, unlockEgg, eggUnlocked, hintDue, EGG_HINTS, overlays, localTime, localOffset, fridayDeploy, type EggStore } from './eggs.ts'
import { branchOf, gitBase, rebase, refreshCounts, serial, type Repo } from './changes.ts'
import { readDiff } from './diff.ts'
import { loadTasks, taskListId } from './tasks.ts'
import { cacheHit, heaviest } from './ctxchart.ts'
import { tierFor } from './layout.tsx'
import { renderBand } from './band.tsx'
import { renderPane, bubbleBox, petStripCols, visibleTabs, type PaneExtra, type PaneView, type TabId } from './pane.tsx'
import { spinnerWord, newTurnWord } from './restyle.ts'
import { styleRow } from './rows.tsx'
import { makeTurns } from './turns.ts'
import { orbStateOf, usesOwnSpinner, checkedSpinnerProps } from './spinner.ts'
import type { PetClientProps } from './client/pet.tsx'
import type { OrbState } from './motion.ts'
import { statusText, writeStatusFile, drawsStatusLine, ensureRefresh, BACKUP_KEY, STATUS_DIR } from './statusline.ts'
import { parseFields, DEFAULT_FIELDS, type ColorMode, type FieldId } from './fields.ts'
import { DEFAULT_SETUP, parseSetup, type Setup } from './setup.ts'
import { runCommand, pastedGlowup, type Ctl } from './command.ts'
import { SHORT_TEXT, FULL_TEXT } from './help.ts'
import { renderHelp, renderColorList } from './helpcard.tsx'
import { cycleCommands, inputCommand, inputValue, type ConfigState, type CycleId, type InputId } from './configrows.ts'
import { renderConfig, type ConfigNote } from './configpane.tsx'
import { encodeLink } from './link.ts'
import { loadUserThemes } from './userthemes.ts'
import { firstRun } from './firstrun.ts'
import { registerCopy, touchCopy, decide, unregisterCopy, pruneStatus, safeId, HEARTBEAT_MS } from './instances.ts'
import { staleToast, INSTALLED_FILE } from './update.ts'
import { syncPlugin } from './pluginsync.ts'
import { cleanFrames, cleanRows, cleanDivider, fitField, meterWindows, type Frames, type Divider } from './renderers.ts'
import { ditherMeters, turnDivider } from './effects.ts'
import type { FieldClientProps } from './client/field.tsx'
import type { Seg } from './layout.tsx'
import { allowed, createRun, isLive, isUndo, newLines, restoreUndo, runTimes, scanRuns, snapshotOf, type Cursor } from './remote.ts'
import { detached, ensureBinary, pickTerminal, platformOf, releaseTarget, removeTree, shellLine, type TermEnv } from './launch.ts'

type Engine = EngineInterface
type SpinKey = { turnAt: number; detail: string; state: OrbState }

const BAND = { plugin: 'glowup', key: 'band' } as const
const PANE = { plugin: 'glowup', key: 'pane' } as const
const SPIN = { plugin: 'glowup', key: 'spinner' } as const
const PET = { plugin: 'glowup', key: 'pet' } as const
const HAIKU = { plugin: 'glowup', key: 'haiku' } as const
// The session id that was greeted. A hot reload re-runs session.start, and must not greet again.
const HELLO = { plugin: 'glowup', key: 'hello' } as const

// Module state: one session per process. A hot reload starts it over, which only
// loses the in-flight session's view (settings and takeover state live in $.store).
let model: Model = initialModel()
let mix: Mix = DEFAULT_MIX
let look: Look = resolveLook(DEFAULT_MIX, {}, {}).look
let theme: Theme = look.theme
let pet: PetSetting = 'clawd'
// A user pet's sheet, read when it is picked: the render hook may not read disk.
let petSheet: PetSheet | undefined
let bubbles: BubbleSetting = 'on'
let view: PaneView = { tab: DEFAULT_SETUP.tabs[0]! }
// the open tab's last window offset and window height, as the pane drew them; ui.scroll clamps and pages by them
let scroll = { last: 0, win: 0 }
let git: Repo | undefined
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
type Bubble = { text: string; mood: Moment; until: number }
type PetSnap = { input: PetInput; overlays: string[]; bubble?: Bubble; friday: boolean }
let bubble: Bubble | undefined
let lastTemplate: string | undefined
const haikuGate = new HaikuGate()
let haikuAbort: AbortController | undefined
let bubbleTimer: Timer | undefined
let turnNo = 0
// Characters the last drawn pane can show in a bubble; 40 until a pane has drawn.
let bubbleCap = 40
// false in a plain -p run, where nobody sees a bubble
let interactive = true
let friday = false
let failed = false
// The last main-loop test run in this session failed; a pass then speaks `green`.
let red = false
// What this turn has earned so far besides the answer; turn.complete turns it into XP.
let turnGain = { green: 0, commits: 0 }
// Set by turn.complete, spoken (or dropped) by the turn-done feed that follows it.
let pendingLevelUp: { level: number; unlock?: string } | undefined
// A fresh session greets once, at its first pane draw, unless something else spoke first.
let helloDue = false
let tzOffset = 0
let installed: number | undefined
let lastPet = ''
let eggJuggleAt: number | undefined
let clickToasted = false
const PANE_OPEN: PaneOpenArgs = { id: 'glowup', title: 'glowup', focus: true, closeOnEscape: true }
const CONFIG_ID = 'glowup-config'
const CONFIG_OPEN: PaneOpenArgs = { id: CONFIG_ID, title: 'glowup config', focus: true, closeOnEscape: true, rows: 40 }
// Read when the config pane opens and after each pack change: its render hook may not read disk.
let configPacks: string[] = Object.keys(PACKS)
let configShiny = false
let configEgg = false
let configUserPets: string[] = []
let configNote: ConfigNote | undefined
// The element holding the config pane's focus ring, from ui.focus; the preview marks what it paints.
let configFocus: string | undefined
// The config TUI run this session owns (hooks/remote.ts); one at a time.
let remote: { dir: string; cursor: Cursor; seen: boolean } | undefined
let remoteTimer: Timer | undefined
let remotePolling = false
let modVersion: string | undefined
// the plugin's userConfig, kept for loadSettings: an undo reloads settings outside register()
let pluginOptions: Readonly<Record<string, unknown>> = {}
const DOCK_OPEN: PaneOpenArgs = { id: 'glowup', title: 'glowup' }

function hostOf($: Engine): Host {
  return {
    run: async (argv, env, timeoutMs) => {
      const r = await $.process.run(argv, env || timeoutMs ? { ...(env && { env }), ...(timeoutMs && { timeoutMs }) } : undefined)
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    stat: path => $.fs.stat(path).then(s => ({ mtimeMs: s.mtimeMs }), () => undefined),
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
// After /clear, session.end still reports the ending id and no turn.start comes until the first
// prompt, so the beat is what notices the new id.
async function beatStatus($: Engine) {
  try {
    const id = await $.session.id()
    if (id && id !== sessionId) {
      if (await recheckGuard($, id)) return
      // turn.start may have adopted the id while the guard check was awaited
      if (id === sessionId) return
      await adoptSession($, sessionId)
    }
  } catch {}
  writeStatus($, true)
}
function startBeat($: Engine) {
  beatTimer?.cancel()
  beatTimer = $.clock.every(HEARTBEAT_MS, () => {
    if (guardSid) void touchCopy(hostOf($), guardSid, guardRoot, Date.now()).catch(() => {})
    void beatStatus($)
    void checkStale($)
  })
}
// A winning copy whose store has no backup (the takeover was made by another copy
// or an earlier install) still owns the file settings.json points at.
async function syncTakeover($: Engine) {
  // the first-run timer can fire after recheckGuard turned this copy off
  if (off) return
  const draws = await drawsStatusLine(hostOf($))
  takenOver = (await hostOf($).storeGet(BACKUP_KEY)) !== undefined || draws
  if (draws) await ensureRefresh(hostOf($)).catch(() => {})
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

// A renderer plugin's answers (glowup.field, glowup.meter). They are asked outside the draw,
// which may not write state, and the field can take a renderer a while to compute; the answer
// lands in its slot and publish redraws the pane. `key` is what the held value was asked for.
type Asked<T> = { key: string; value: T | null; pending?: string }
const fieldAsk: Asked<Frames> = { key: '', value: null }
const meterAsk: Asked<Seg[][]> = { key: '', value: null }
function ask<T>($: Engine, slot: Asked<T>, key: string, call: () => Promise<T | null>) {
  if (slot.key === key || slot.pending === key) return
  slot.pending = key
  $.clock.after(0, async () => {
    let value: T | null = null
    try { value = await call() } catch { value = null }
    // a newer ask overtook this one while it ran
    if (slot.pending !== key) return
    slot.key = key; slot.value = value; slot.pending = undefined
    publish($)
  })
}
const turns = makeTurns()
const dividerByMessage = new Map<string, { key: string; value: Divider | null }>()
const palette = () => ({ ...theme.colors })
// What a held answer was asked under: both layers' packs and the effects the look picked,
// since a mix can take its colors and its motion from different packs.
const lookKey = () => JSON.stringify([mix.colors, mix.motion, look.meters, look.dividers, look.motion.field])
// Asked while drawing: one short call per prompt and pack, kept for its redraws.
async function dividerFor($: Engine, messageId: string): Promise<Divider | null> {
  const pending = messageId === 'placeholder'
  const turn = turns.turnFor(messageId), pack = mix.colors, colors = palette()
  const key = JSON.stringify([lookKey(), colors])
  const held = pending ? undefined : dividerByMessage.get(messageId)
  if (held?.key === key) return held.value
  let value: Divider | null = null
  try { value = cleanDivider(await $.glowup.divider({ pack, turn, colors }), colors.text) } catch { value = null }
  value ??= look.dividers ? turnDivider(turn, colors) : null
  if (!pending) dividerByMessage.set(messageId, { key, value })
  return value
}

const petOn = () => pet !== 'off' && !reducedMotion

const PET_KINDS: readonly string[] = ['read', 'search', 'edit', 'shell', 'agent', 'plan']
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
  juggleAt: eggJuggleAt,
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
// replaces it, and the bubble then shows for the full setup's bubbles.ms from that moment.
function armBubble($: Engine, mine: Bubble) {
  mine.until = Date.now() + setup.bubbles.ms
  bubbleTimer?.cancel()
  bubbleTimer = $.clock.after(setup.bubbles.ms + 100, () => {
    bubbleTimer = undefined
    if (bubble === mine) { bubble = undefined; publishPet($) }
  })
}

async function say($: Engine, mood: Moment, vars: BubbleVars) {
  if (bubbles === 'off' || !petOn() || !speaks(mood, setup.bubbles.moods)) return
  // Kind words only, never the act's label: it holds commands, paths and patterns.
  const ctx: HaikuContext = {
    mood,
    pose: model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind! : 'think') : 'idle',
    label: mood === 'needs-you' ? 'waiting for approval' : model.working ? kindWords(model.act.kind) : undefined,
    tests: mood === 'fail' ? (vars.n === undefined ? 'failed' : `failed ${vars.n}`) : model.lastTest ? (model.lastTest.passed ? 'passed' : 'failed') : undefined,
    daypart: daypart(localTime(Date.now(), tzOffset).hour),
    limit: bubbleCap,
    voice: voiceFor(pet, petSheet?.voice),
  }
  let paneShown = false
  try { paneShown = (await $.ui.panes()).some(p => p.id === 'glowup' && p.isShown) } catch {}
  // A closed pane shows nobody the bubble. The Pane render hook cleared helloDue before scheduling this,
  // so a first draw that ran before the pane was reported shown retries the hello on its next draw.
  if (!paneShown) { if (mood === 'hello') helloDue = true; return }
  helloDue = false
  if (mood === 'hello') void $.state.set(HELLO, { sid: sessionId })
  const hint = mood === 'done' || mood === 'long-done' ? await eggHint($) : undefined
  const now = Date.now(), t = localTime(now, tzOffset)
  const flavours = flavoursOf(t, overlays(t, installed === undefined ? undefined : localTime(installed, tzOffset), friday, failed))
  const line = hint === undefined ? bubbleFor(pool(linesFor(pet, petSheet?.lines), mood, flavours, levelOf(model.xp ?? 0).level), vars, lastTemplate, Math.random) : undefined
  if (line) lastTemplate = line.template
  const mine: Bubble = { text: hint ?? line!.text, mood, until: 0 }
  bubble = mine
  armBubble($, mine)
  publishPet($)
  // Haiku never sees a hint turn: it could improvise the code.
  if (hint === undefined && mood !== 'hello' && mood !== 'compact' && mood !== 'level-up') void askHaiku($, mine, ctx)
}
async function eggHint($: Engine): Promise<string | undefined> {
  try {
    const host = hostOf($)
    const eggs = await host.storeGet('eggs') as EggStore | undefined
    const now = await $.clock.now()
    if (!hintDue(eggs, now)) return undefined
    const hints = eggs?.hints ?? 0
    await host.storeSet('eggs', { ...eggs, passRuns: eggs?.passRuns ?? 0, hintAt: now, hints: hints + 1 })
    return EGG_HINTS[hints % EGG_HINTS.length]
  } catch (err) {
    $.ui.log(`egg hint failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    return undefined
  }
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
  let said = momentOf(old, model, ev, { red, moods: setup.bubbles.moods })
  // applyEvent sets lastTest only for main-loop runs, so a subagent's tests never flip this
  if (model.lastTest && model.lastTest.at !== old.lastTest?.at) red = !model.lastTest.passed
  // XP does not depend on the green bubble being on
  if (said?.moment === 'green') turnGain.green++
  if (ev.type === 'turn-done') {
    if (pendingLevelUp && (said === undefined || said.moment === 'done' || said?.moment === 'long-done') && speaks('level-up', setup.bubbles.moods)) said = { moment: 'level-up', vars: { unlock: pendingLevelUp.unlock } }
    pendingLevelUp = undefined
  }
  if (said) void say($, said.moment, said.vars)
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

async function readConfigLists($: Engine) {
  const host = hostOf($)
  const user = await loadUserPacks(host)
  configPacks = [...new Set([...Object.keys(PACKS), ...Object.keys(user).filter(n => SAFE_NAME.test(n))])]
  const eggs = (await host.storeGet('eggs')) as EggStore | undefined
  configShiny = eggs?.shinyAt !== undefined
  configEgg = eggUnlocked(eggs)
  // a listed pet that does not load would be refused forever, and the Pet row would repeat it
  const pets: string[] = []
  for (const n of await userPetNames(host)) if ('sheet' in await loadUserPet(host, n)) pets.push(n)
  configUserPets = pets
}

async function openConfig($: Engine): Promise<string> {
  await readConfigLists($)
  configNote = undefined
  configFocus = undefined
  const r = await $.ui.open(CONFIG_OPEN)
  return r.isPlaced ? 'glowup config open (Esc closes it)' : `glowup config waits: ${r.reason}`
}

const configState = (): ConfigState => ({ packs: configPacks, mix, colors: look.theme.colors, pet, shiny: configShiny, egg: configEgg, userPets: configUserPets, bubbles, reduced: reducedMotion, setup, fields })

// Every change runs as the typed command would; the last command's first line, or its setting's row for a setup, becomes the pane's note.
// A command that leaves the state unchanged was refused, so the rest of the run is dropped: the
// meter cycle's second command must not follow a refused first.
async function runConfig($: Engine, cmds: string[]) {
  let text = '', lastCmd = '', stopped = false
  for (const cmd of cmds) {
    lastCmd = cmd
    const before = JSON.stringify(configState())
    text = await runCommand(hostOf($), cmd, ctlOf($))
    const moved = JSON.stringify(configState()) !== before
    // after the compare: a pack or pet that vanished from disk shrinks the list but was still refused
    if (cmd.startsWith('pack ') || cmd.startsWith('pet ')) await readConfigLists($)
    if (!moved) { stopped = true; break }
  }
  const lines = text.split('\n'), key = lastCmd.match(/^setup (\S+)/)?.[1]
  // every setup command prints the whole table, whose first row is always band
  const line = key ? lines.find(l => l.startsWith(`${key} `)) : undefined
  configNote = { text: line ?? lines[0]!, tone: stopped ? 'error' : 'ok' }
  await syncTakeover($)
  relook($)
}

// runConfig is no use here: it drops the rest of a run after a command that changed nothing, and
// either half of a reset may have nothing to clear.
async function resetConfig($: Engine) {
  if (!(await ctlOf($).confirm('Reset color overrides and your setup (band, tabs, meter, bubbles, pet sleep) to their defaults?'))) return
  await runCommand(hostOf($), 'color reset', ctlOf($))
  await runCommand(hostOf($), 'setup reset', ctlOf($))
  configNote = { text: 'Colors and setup are back to their defaults.', tone: 'ok' }
  await syncTakeover($)
  relook($)
}

async function copyStudioLink($: Engine, link: string, surface: RenderSurface) {
  const r = await $.ui.copy({ text: link, surface }).catch((e: unknown) => ({ isCopied: false as const, reason: e instanceof Error ? e.message : String(e) }))
  configNote = r.isCopied
    ? { text: 'Studio link copied. Open it in a browser to fine-tune this look.', tone: 'ok' }
    : { text: `Could not copy the studio link: ${r.reason}`, tone: 'error' }
  relook($)
}

function stopRemote() {
  remoteTimer?.cancel()
  remoteTimer = undefined
  remote = undefined
}

function startRemote($: Engine, dir: string, cursor: Cursor) {
  stopRemote()
  remote = { dir, cursor, seen: false }
  remoteTimer = $.clock.every(250, () => void pollRemote($))
}

async function versionOf($: Engine): Promise<string> {
  modVersion ??= await hostOf($).readFile(`${$.plugin.root}/.claude-plugin/plugin.json`)
    .then(t => String((JSON.parse(t) as { version?: unknown }).version ?? 'dev'), () => 'dev')
  return modVersion
}

async function writeRemoteState($: Engine) {
  if (!remote) return
  const snap = snapshotOf(configState(), look, { cursor: remote.cursor, version: await versionOf($), cwd, note: configNote })
  await hostOf($).writeFile(`${remote.dir}/state.json`, JSON.stringify(snap))
}

// Applies each new line of the run's commands.jsonl as the pane applied a press, then
// writes state.json. Only this session reads the run, so the store has one writer.
async function pollRemote($: Engine) {
  if (!remote || remotePolling) return
  remotePolling = true
  try {
    const host = hostOf($), r = remote
    const t = await runTimes(host, r.dir)
    // the TUI removes open when it quits; before its first write open is simply not there yet
    if (t.open !== undefined) r.seen = true
    // it writes its last line before removing open, so a quit still owes one read of the file
    const quit = r.seen && t.open === undefined
    if (!isLive(t.open, t.owner, Date.now()) && !quit) { stopRemote(); return }
    const { lines, consumed } = newLines(await host.readFile(`${r.dir}/commands.jsonl`).catch(() => ''), r.cursor.lines)
    if (consumed === r.cursor.lines) { if (quit) stopRemote(); return }
    for (const line of lines) {
      if (!line) { $.ui.log('glowup config: skipped a line that does not parse', { to: 'debug' }); continue }
      if (line.seq <= r.cursor.seq) continue
      r.cursor.seq = line.seq
      if ('undo' in line) {
        const undo: unknown = await host.readFile(`${r.dir}/undo.json`).then(JSON.parse, () => undefined)
        if (!isUndo(undo)) { configNote = { text: 'glowup config could not undo: undo.json is missing or damaged.', tone: 'error' }; continue }
        await restoreUndo(host, undo)
        await loadSettings($, host, true)
        await readConfigLists($)
        configNote = { text: 'Back to how it was when glowup config opened.', tone: 'ok' }
        await syncTakeover($)
        relook($)
        writeStatus($, true)
        publishPet($)
        $.ui.status(statusEntry())
        continue
      }
      const bad = line.cmds.find(c => !allowed(c))
      if (bad) { configNote = { text: `glowup config cannot run "${shown(bad)}".`, tone: 'error' }; continue }
      await runConfig($, line.cmds)
    }
    r.cursor.lines = consumed
    await writeRemoteState($)
    if (quit) stopRemote()
  } catch (err) {
    $.ui.log(`glowup config poll failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    remotePolling = false
  }
}

// the engine has no platform API; Windows sets OS everywhere, and WSL reports Linux
const onWindows = async ($: Engine) => (await $.env.get('OS')) === 'Windows_NT'

// $.env.get takes literal names only
async function termEnv($: Engine): Promise<TermEnv> {
  return {
    TMUX: await $.env.get('TMUX'), KONSOLE_VERSION: await $.env.get('KONSOLE_VERSION'), KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'), WEZTERM_PANE: await $.env.get('WEZTERM_PANE'),
    GNOME_TERMINAL_SCREEN: await $.env.get('GNOME_TERMINAL_SCREEN'), TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    TERMINAL: await $.env.get('TERMINAL'), DISPLAY: await $.env.get('DISPLAY'), WAYLAND_DISPLAY: await $.env.get('WAYLAND_DISPLAY'),
  }
}

async function openConfigTui($: Engine): Promise<string> {
  const surfaces = await $.session.surfaces().catch(() => ['terminal'])
  if (!surfaces.includes('terminal')) return openConfig($)
  const host = hostOf($)
  // a run whose TUI never wrote open (a window that did not appear) gives way to a new one
  if (remote) {
    const t = await runTimes(host, remote.dir)
    if (t.open !== undefined && isLive(t.open, undefined, Date.now())) return 'glowup config is already open.'
  }
  const windows = await onWindows($)
  // no uname on native Windows; WSL reports Linux and takes the Unix path
  const unameS = windows ? 'Windows_NT' : (await host.run(['uname', '-s']).catch(() => undefined))?.stdout ?? ''
  const unameM = windows ? (await $.env.get('PROCESSOR_ARCHITECTURE')) ?? '' : (await host.run(['uname', '-m']).catch(() => undefined))?.stdout ?? ''
  const platform = platformOf(unameS)
  const bin = await ensureBinary(host, { glowupBin: (await $.env.get('GLOWUP_BIN')) || undefined, pluginRoot: $.plugin.root, version: await versionOf($), target: releaseTarget(unameS, unameM), windows, onDownload: () => $.ui.toast('Downloading glowup-installer…') })
  if ('error' in bin) return `glowup config needs its installer binary: ${bin.error}`
  await readConfigLists($)
  configNote = undefined
  const dir = await createRun(host, sessionId, Math.random().toString(36).slice(2, 10))
  startRemote($, dir, { seq: 0, lines: 0 })
  await writeRemoteState($)
  const cmd = [bin.path, 'config', '--run', dir]
  const manual = `Run this in a terminal: ${shellLine(cmd, platform)}`
  if (!platform) return manual
  const onPath = async (name: string) => platform === 'linux' && (await host.run(['sh', '-c', `command -v ${name}`]).catch(() => undefined))?.exitCode === 0
  const has = { xdgTerminalExec: await onPath('xdg-terminal-exec'), xTerminalEmulator: await onPath('x-terminal-emulator') }
  const term = pickTerminal(await termEnv($), platform, has, cmd)
  if (!term) return manual
  const r = await host.run(detached(term.argv, platform)).catch(() => undefined)
  if (r?.exitCode !== 0) return manual
  return `glowup config is opening in ${term.name}. If no window appears, ${manual[0]!.toLowerCase()}${manual.slice(1)}`
}

// Not awaited by callers: git must not hold up a tool result. A refresh that
// started before adoptSession must not land in the new session's model.
function refresh($: Engine) {
  refreshQueue(async () => {
    const seq = refreshSeq
    const host = hostOf($)
    const repo = git && await rebase(host, git)
    const asked = model.files
    const files = await refreshCounts(host, asked, repo, Date.now())
    if (seq !== refreshSeq) return
    git = repo
    model = mergeCounts(model, files, asked.map(f => f.path))
    redraw($)
    void readBranch($)
    // the Diff tab is the only reader, so git only produces hunks while it is on screen
    if (visibleTabs(setup.tabs, view.tab).tab === 'diff') {
      const diff = await readDiff(host, repo, model.files)
      if (seq !== refreshSeq || !diff) return
      view = { ...view, diff }
      publish($)
    }
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
  const { limits, xp } = model
  model = { ...initialModel(), limits, xp }
  turnGain = { green: 0, commits: 0 }
  pendingLevelUp = undefined
  view = { tab: setup.tabs[0]! }
  bubble = undefined
  xpByMessage.clear()
  cancelHaiku()
  friday = false
  failed = false
  red = false
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

// The stored choices over the plugin's userConfig. An undo from the config TUI runs it again outside register(),
// and then must not repeat the start-up toasts or reset the docked pane's tab.
async function loadSettings($: Engine, host: Host, undo = false) {
  mix = await initialMix(host, pluginOptions)
  const storedPet = await host.storeGet('pet')
  const eggs = await host.storeGet('eggs') as EggStore | undefined
  const want = typeof storedPet === 'string' ? storedPet : typeof pluginOptions.pet === 'string' && pluginOptions.pet ? pluginOptions.pet : 'clawd'
  pet = 'clawd'
  petSheet = undefined
  if (want === 'clawd-shiny') pet = eggs?.shinyAt === undefined ? 'clawd' : want
  else if (want === 'egg') {
    if (eggUnlocked(eggs)) { pet = 'egg'; petSheet = eggSheet(eggs) }
    // the built-in name wins, so an older pets/egg.json is never loaded
    if (interactive && !undo && await host.exists(`${PET_DIR(configDir)}/egg.json`).catch(() => false)) {
      $.ui.toast('A pet file named egg.json is now the built-in egg\'s name; rename the file and its "name" to keep your pet.')
    }
  }
  else if (want === 'off' || Object.hasOwn(BUILTIN_SHEETS, want)) pet = want
  else {
    const r = await loadUserPet(host, want)
    if ('sheet' in r) { pet = want; petSheet = r.sheet }
    // every loadUserPet error already names the pet or its file
    else if (interactive && !undo) $.ui.toast(`${/[.!?]$/.test(r.error) ? r.error : `${r.error}.`} Showing Clawd.`)
  }
  const storedBubbles = await host.storeGet('bubbles')
  bubbles = BUBBLES.includes(storedBubbles as BubbleSetting) ? storedBubbles as BubbleSetting : BUBBLES.includes(pluginOptions.bubbles as BubbleSetting) ? pluginOptions.bubbles as BubbleSetting : 'on'
  await loadLook($)
  const motion = await host.storeGet('reducedMotion')
  reducedMotion = typeof motion === 'boolean' ? motion : pluginOptions.reducedMotion === true
  configFields = parseFields(pluginOptions.statusline) ?? DEFAULT_FIELDS
  fields = parseFields(await host.storeGet('statusline')) ?? configFields
  const parsed = parseSetup(await host.storeGet('setup'))
  setup = parsed.setup
  if (!undo || !setup.tabs.includes(view.tab)) view = { ...view, tab: setup.tabs[0]! }
  if (parsed.notices.length && !undo) $.ui.toast(`glowup setup: ${parsed.notices.join('; ')}`)
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
    setPet: (p, sheet) => { pet = p; petSheet = sheet; relook($) },
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
    openConfig: () => openConfig($),
    openConfigTui: () => openConfigTui($),
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
  stopRemote()
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
  pluginOptions = options
  reducedMotion = options.reducedMotion === true

  // Null from glowup's own methods. When no renderer answers, glowup draws the effect the pack
  // picked (hooks/effects.ts) in the caller, not here: the test engine never runs these bodies.
  on('engine.create', async (_$, e, next) => {
    const built = await next(e)
    return { ...built, glowup: { field: async () => null, meter: async () => null, divider: async () => null } }
  })

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    interactive = e.isInteractive
    red = false
    helloDue = false
    cancelHaiku()
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    // cmd and PowerShell set USERPROFILE, not HOME
    home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
    const xdg = await $.env.get('XDG_DATA_HOME')
    dataHome = xdg && /^([/\\]|[A-Za-z]:[/\\])/.test(xdg) ? xdg : `${home}/.local/share`
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
    await $.command.register({ name: 'glowup', description: 'Themes, the glowup pane and status line', argumentHint: 'config|theme|pack|spinner|color|import|export|pet|bubbles|pane|motion|statusline on|fields|setup|level|restore' })
    await loadSettings($, host)
    sessionId = await $.session.id()
    try { helloDue = e.isInteractive && (await $.state.get(HELLO)).value?.sid !== sessionId } catch { helloDue = e.isInteractive }
    // A hot reload restarts this module mid-run: pick this session's live run back up, and
    // drop runs nobody has touched for a day.
    try {
      const { live, stale } = await scanRuns(host, sessionId, Date.now())
      const platform = (await onWindows($)) ? 'windows' : 'linux'
      for (const d of stale) await removeTree(host, d, platform)
      if (live[0]) {
        const st = JSON.parse(await host.readFile(`${live[0]}/state.json`).catch(() => '{}')) as { seq?: unknown; lines?: unknown }
        startRemote($, live[0], { seq: Number(st.seq) || 0, lines: Number(st.lines) || 0 })
      }
    } catch (err) {
      $.ui.log(`glowup config resume failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    // the sandbox may run in UTC, where getTimezoneOffset() says 0 for everyone
    const tzo = new Date().getTimezoneOffset()
    let zone: string | undefined
    if (tzo === 0) { try { zone = (await host.run(['date', '+%z'])).stdout } catch {} }
    tzOffset = localOffset(tzo, zone)
    const at = await host.storeGet('installed-at')
    installed = typeof at === 'number' ? at : undefined
    turnGain = { green: 0, commits: 0 }
    pendingLevelUp = undefined
    try { feed($, { type: 'level', xp: parseLevelStore(await host.storeGet('level')) }) } catch {}
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
    // a hot reload restarts the module mid-session with an empty model; without this the beat
    // writes a line with no ctx or limits until the next tool call or turn end
    void feedContext($)
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
    turnGain = { green: 0, commits: 0 }
    pendingLevelUp = undefined
    feed($, { type: 'turn-start', at: Date.now() })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!off && !e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      if (effort !== model.effort) feed($, { type: 'effort', effort })
    }
    return yield* next(e)
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
    if (!denied && !ran.isError && !e.agentId && e.tool === 'Bash' && typeof input.command === 'string' && isCommitCommand(input.command)) turnGain.commits++
    if (!e.agentId && model.lastTest?.at === endAt && !model.lastTest.passed) {
      failed = true
      publishPet($)
    }
    if (!e.agentId && model.lastTest?.at === endAt && model.lastTest.passed) {
      try {
        const r = recordPass(await hostOf($).storeGet('eggs') as EggStore | undefined, Date.now())
        await hostOf($).storeSet('eggs', r.next)
        if (pet === 'egg') {
          const cracked = eggSheet(r.next)
          if (cracked !== petSheet) { petSheet = cracked; relook($) }
        }
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
    // turn-done leaves combo alone (turn-start resets it), so the model still holds this turn's count
    try {
      const host = hostOf($)
      const before = parseLevelStore(await host.storeGet('level'))
      const after = before + turnXp({ answered: e.reason === 'answer', combo: model.combo, ...turnGain })
      await host.storeSet('level', levelStore(after))
      feed($, { type: 'level', xp: after })
      pendingLevelUp = levelUp(before, after)
    } catch (err) {
      $.ui.log(`level store failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
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
    const mine = renderBand(els, live ? normalizeModel(live.model) : model, theme, e.props.bodyColumns, tier, Date.now(), { look, band: setup.band })
    if (!mine) return below
    // other mods draw bands here too: stack ours on top instead of replacing theirs
    const { Box } = els
    return <Box flexDirection="column">{mine}{below}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: 'glowup' }, async ($, e, next) => {
    if (off) return next(e)
    // The pane is usually closed at session start, so the hello waits for the first draw.
    if (helloDue && !bubble) { helloDue = false; $.clock.after(0, () => void say($, 'hello', {})) }
    // a render hook cannot write state: publish after the draw
    if (panePlacement !== e.props.placement) { panePlacement = e.props.placement; $.clock.after(0, () => publish($)) }
    const live = (await $.state.get(PANE)).value as { model: Model; view: PaneView } | undefined
    const compact = e.props.placement === 'inline' && e.props.bodyColumns < 80
    const box = bubbleBox(e.props.bodyColumns, compact)
    bubbleCap = haikuLimit(box.cols, box.lines)
    const v: PaneView = { ...(live?.view ?? view), reduced: reducedMotion }
    const els = $.ui.resolve(e)
    // the look always applies; the pet and its words only while he is on
    const pid = pet, reduced = reducedMotion
    let extra: PaneExtra = { look, tabs: setup.tabs }
    if (pid !== 'off' && !reduced && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const snap = ((await $.state.get(PET)).value as PetSnap | undefined) ?? petSnap()
      const { Client } = $.ui.resolve(e)
      const props: PetClientProps = { pet: pid, input: snap.input, overlays: snap.overlays, reduced, compact, width: petStripCols(e.props.bodyColumns), tint: look.pet, ...(petSheet && { sheet: petSheet }) }
      const sheet = petSheet ?? (Object.hasOwn(BUILTIN_SHEETS, pid) ? BUILTIN_SHEETS[pid] : undefined) ?? CLAWD_SHEET
      // unsized, the region shrinks to the sprite and surface.columns leaves no room to walk
      const node = <Client key="glowup-pet" module="./client/pet.tsx" props={props} width={compact ? undefined : props.width} />
      const bubbleNow = snap.bubble && snap.bubble.until > Date.now() ? snap.bubble : undefined
      extra = { ...extra, pet: { id: pid, node, rows: stripRows(sheet, snap.overlays) }, bubble: bubbleNow, friday: snap.friday }
    }
    // the engine scrolls the whole body, which would carry the pet off with a long tab: budget the tab to bodyRows instead
    extra = { ...extra, bodyRows: e.props.scroll.bodyRows, onRange: (last, win) => { scroll = { last, win } } }
    if (e.props.placement === 'dock') extra = { ...extra, minRows: e.props.scroll.bodyRows }
    const m = live ? normalizeModel(live.model) : model, pack = mix.colors, colors = palette(), picked = lookKey()
    if (!compact) {
      const width = e.props.bodyColumns - 2 - 4, windows = meterWindows(m, Date.now(), tzOffset)
      ask($, meterAsk, JSON.stringify([picked, width, windows, m.ctxPercent, colors]), async () =>
        cleanRows(await $.glowup.meter({ pack, width, windows, ctxPercent: m.ctxPercent, colors }), 3, colors.text)
          ?? (look.meters === 'dither' ? ditherMeters(width, windows, m.ctxPercent, colors) : null))
      // between asks the last rows stay up, but never another look's
      if (meterAsk.value && JSON.parse(meterAsk.key)[0] === picked) extra = { ...extra, meter: meterAsk.value }
    }
    if (e.props.placement === 'dock' && !compact && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const cols = e.props.bodyColumns - 2, rows = e.props.scroll.bodyRows, reduced = reducedMotion
      const key = JSON.stringify([picked, cols, rows, colors, reduced])
      ask($, fieldAsk, key, async () => cleanFrames(await $.glowup.field({ pack, cols, rows, colors, reduced }), rows, colors.text))
      // a plugin's frames win; else the pack's own shape, which the Client draws live, so it sends no frames
      const got = fieldAsk.key === key ? fieldAsk.value : null, field = look.motion.field
      if (got || field.shape !== 'none') {
        const { Client } = $.ui.resolve(e)
        extra = { ...extra, field: (open: number) => {
          const fit = got && fitField(got, open)
          if (got && !fit) return null
          const props: FieldClientProps = fit ? { frames: fit.frames, ms: fit.ms, reduced } : { live: { cols, rows: open, colors, field }, reduced }
          return <Client key="glowup-field" module="./client/field.tsx" props={props} width={cols} />
        } }
      }
    }
    return renderPane(els, m, theme, { ...v, meter: setup.meter }, e.props.bodyColumns, compact, Date.now(), (id: TabId) => {
      view = { ...view, tab: id, offset: 0 }
      publish($)
      if (id === 'plan') void feedContext($)
      if (id === 'diff') refresh($)
    }, extra)
  })

  // No next(): the pane draws its own window, and the engine moving the whole body would carry the pet and status box off.
  on('ui.scroll', { component: 'Pane', requestId: 'glowup' }, async ($, e, next) => {
    if (off) return next(e)
    // The engine sizes the person's page keys, Home and End by its own body, which the tab's window is shorter
    // than, and they arrive alike here (the pane fills its body): each pages by the tab's window.
    const page = e.origin.kind === 'person' && Math.abs(e.by) >= e.bodyRows && scroll.win > 0
    const by = page ? Math.sign(e.by) * scroll.win : e.by
    const offset = Math.max(0, Math.min(Math.min(view.offset ?? 0, scroll.last) + by, scroll.last))
    if (offset !== view.offset) { view = { ...view, offset }; publish($) }
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: CONFIG_ID }, async ($, e, next) => {
    if (off) return next(e)
    const els = $.ui.resolve(e) as any
    const s = configState()
    const link = encodeLink({ pack: exportMix(look, exportName(mix.colors)), setup })
    return renderConfig(els, s, look, e.props.bodyColumns, {
      cycle: (id: CycleId) => void runConfig($, cycleCommands(id, configState())),
      input: (id: InputId, text: string) => {
        const now = configState()
        const r = inputCommand(id, text, now)
        if ('error' in r) { configNote = { text: r.error, tone: 'error' }; relook($); return }
        // Enter on an untouched field would run a no-op command and report it as refused.
        const same = inputCommand(id, inputValue(id, now), now)
        if ('cmd' in same && same.cmd === r.cmd) return
        void runConfig($, [r.cmd])
      },
      done: () => void $.ui.close({ id: CONFIG_ID }),
      reset: () => void resetConfig($),
      copyLink: () => void copyStudioLink($, link, e.surface),
    }, { focus: configFocus, note: configNote, link })
  })

  on('ui.focus', async ($, e, next) => {
    if (!off && e.component === 'Pane' && e.requestId === CONFIG_ID) {
      const was = configFocus
      configFocus = e.element
      // only a color row changes the preview's marker, so other moves skip the redraw
      if ([was, configFocus].some(k => k?.startsWith('input-color:'))) $.ui.invalidate('ui.render')
    }
    return next(e)
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
    const own = p.origin.kind === 'composer' && !p.from && !p.task
    const els = $.ui.resolve(e)
    const styled = styleRow(els, look, { site: 'UserMessage', text: p.text, isExpanded: p.isExpanded, own, turn: own && !p.isExpanded ? turns.turnFor(e.requestId) : undefined }, row) as RenderElement
    if (!own || p.isExpanded) return styled
    const rule = await dividerFor($, e.requestId)
    if (!rule) return styled
    const { Box, Text } = els
    const side = (segs: Seg[], k: string) => <Box key={k} flexShrink={0}>{segs.map(s => <Text color={s.color} bold={s.bold}>{s.text}</Text>)}</Box>
    // Laid over the blank margin line Claude Code opens the row with (see card() in rows.tsx), so
    // the rule sits right above the prompt. The fill is long and its one-row box clips it, since a
    // truncating Text would end it in "…"; neither box is above the engine node.
    return (
      <Box flexDirection="column">
        {styled}
        <Box position="absolute" top={0} left={0} right={0} height={1} flexDirection="row">
          {side(rule.left, 'l')}
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden"><Text color={rule.fill.color}>{rule.fill.text.repeat(400)}</Text></Box>
          {side(rule.right, 'r')}
        </Box>
      </Box>
    )
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
    return styleRow($.ui.resolve(e), look, { site: 'ToolUse', tool: p.tool, input: p.input, isRunning: p.isRunning, isErrored: p.isErrored, isInterrupted: p.isInterrupted, seq: turns.toolSeq(e.requestId) }, row) as RenderElement
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
    if (args === 'color' || args === 'color list') {
      const card = renderColorList($.ui.resolve(e), look, p.text)
      if (card) return card
    }
    return next(e)
  })

  on('command.run', { command: 'glowup' }, async ($, e, next) => {
    if (off) return next(e)
    const text = await runCommand(hostOf($), e.args, ctlOf($))
    await syncTakeover($)
    return { text }
  })

  on('ui.message', async ($, e, next) => {
    // e.module is the path under the plugin folder (hooks/client/pet.tsx), not the string the pane passes as module
    const data = e.data as { konami?: unknown; click?: unknown } | null
    if (off || e.element !== 'glowup-pet' || (data?.konami !== true && data?.click !== true)) return next(e)
    if (data.click === true) {
      if (!clickToasted) { clickToasted = true; $.ui.toast('The pet has the keyboard now. Esc gives it back.') }
      return {}
    }
    try {
      const host = hostOf($)
      const unlocked = unlockEgg(await host.storeGet('eggs') as EggStore | undefined, Date.now())
      if (!unlocked) return {}
      await host.storeSet('eggs', unlocked)
      eggJuggleAt = Date.now()
      publishPet($)
      $.ui.toast('An egg! Press Esc, then /glowup pet egg')
    } catch (err) {
      $.ui.log(`egg unlock failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const args = off ? undefined : pastedGlowup(e.text, e.origin)
    if (args === undefined) return next(e)
    const text = await runCommand(hostOf($), args, ctlOf($))
    await syncTakeover($)
    // the engine shows this as "Prompt dropped by a hook: <reason>", on one line: a newline draws as �
    return { drop: `glowup ran the pasted command. ${text.split('\n').map(l => l.trim()).filter(Boolean).join('; ')}` }
  })
}
