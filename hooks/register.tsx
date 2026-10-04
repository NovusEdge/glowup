import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'
import type { Host } from './host.ts'
import { initialModel, applyEvent, mergeCounts, isBusy, agentsRunning, type Model, type Ev } from './model.ts'
import { approvalLabel, shortPath } from './events.ts'
import type { Theme } from './themes.ts'
import { resolveLook, DEFAULT_MIX, type Mix, type Look } from './packs.ts'
import { loadUserPacks } from './userpacks.ts'
import { PET_ROWS, type PetSetting, type PetId, type PetInput, type PetKind } from './pets.ts'
import { bubbleFor, type BubbleSetting, type BubbleVars, type Mood } from './bubbles.ts'
import { recordPass, overlays, localTime, localOffset, fridayDeploy, type EggStore } from './eggs.ts'
import { gitBase, refreshCounts, serial } from './changes.ts'
import { tierFor } from './layout.tsx'
import { renderBand } from './band.tsx'
import { renderPane, petStripCols, type PaneExtra, type PaneView, type TabId } from './pane.tsx'
import { spinnerWord, newTurnWord } from './restyle.ts'
import { styleRow } from './rows.tsx'
import { orbStateOf, usesOwnSpinner, checkedSpinnerProps } from './spinner.ts'
import type { PetClientProps } from './client/pet.tsx'
import type { OrbState } from './motion.ts'
import { statusText, writeStatusFile, BACKUP_KEY } from './statusline.ts'
import { runCommand, type Ctl } from './command.ts'
import { loadUserThemes } from './userthemes.ts'
import { firstRun } from './firstrun.ts'

type Engine = EngineInterface
type SpinKey = { turnAt: number; detail: string; state: OrbState }

const BAND = { plugin: 'glowup', key: 'band' } as const
const PANE = { plugin: 'glowup', key: 'pane' } as const
const SPIN = { plugin: 'glowup', key: 'spinner' } as const
const PET = { plugin: 'glowup', key: 'pet' } as const
const CONFIG = { plugin: 'glowup', key: 'config' } as const

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
let reducedMotion = false
let docked = false
// Where the surface seated the pane, learned from its last render: panes() does not say.
let panePlacement: 'dock' | 'inline' | undefined
let ticker: Timer | undefined
let refreshSeq = 0
const refreshQueue = serial()
let sessionId = ''
let takenOver = false
let statusTimer: Timer | undefined
let lastStatusLine: string | undefined
let spinKey: SpinKey = { turnAt: 0, detail: '', state: 'think' }
// Pet state, published to PET for the pane only; the band never reads it.
type Bubble = { text: string; mood: Mood; until: number }
type PetSnap = { input: PetInput; overlays: string[]; bubble?: Bubble; friday: boolean }
let bubble: Bubble | undefined
let lastTemplate: string | undefined
let friday = false
let tzOffset = 0
let installed: number | undefined
let lastPet = ''

function hostOf($: Engine): Host {
  return {
    run: async (argv, env) => { const r = await $.process.run(argv, env ? { env } : undefined); return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr } },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDir: async path => (await $.fs.list(path)).map(e => e.name),
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
    home,
  }
}

// The takeover script falls back to the person's own command once this file is
// 10 minutes old, so a quiet session still rewrites it every minute.
function writeStatus($: Engine, force: boolean) {
  const line = statusText(model, theme)
  if (!takenOver || !sessionId || (!force && (line ?? '') === lastStatusLine)) return
  lastStatusLine = line ?? ''
  void writeStatusFile(hostOf($), sessionId, line).catch(() => {})
}
async function syncTakeover($: Engine) {
  takenOver = (await hostOf($).storeGet(BACKUP_KEY)) !== undefined
  statusTimer?.cancel()
  statusTimer = takenOver ? $.clock.every(60_000, () => writeStatus($, true)) : undefined
  writeStatus($, true)
  $.ui.status(statusEntry())
}

// The engine pins this entry as a "⚠ glowup:" notice, which reads as an error
// when it never goes away; the takeover's status line already says the same.
const statusEntry = () => !takenOver && isBusy(model) ? statusText(model, theme) : undefined

const petOn = () => pet !== 'off' && !reducedMotion

const PET_KINDS: readonly string[] = ['read', 'search', 'edit', 'shell', 'agent', 'plan']
// Hats sit above the canvas; held and side outfits fit inside it.
const HEAD_OUTFITS = ['santa', 'party', 'nightcap']
const petInput = (): PetInput => ({
  working: model.working,
  kind: model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind as PetKind : 'think') : undefined,
  needsYou: !!model.needsYou,
  lastTest: model.lastTest,
  doneAt: model.doneAt,
  doneOk: model.act.tone === 'pass' && !model.working,
  actAt: model.actAt,
})
// Through JSON because Client props refuse undefined fields.
function petSnap(): PetSnap {
  const now = Date.now()
  return JSON.parse(JSON.stringify({
    input: petInput(),
    overlays: overlays(localTime(now, tzOffset), installed === undefined ? undefined : localTime(installed, tzOffset), friday),
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

async function say($: Engine, mood: Mood, vars: BubbleVars) {
  if (bubbles !== 'on' || !petOn()) return
  try {
    // a closed pane shows nobody the bubble
    if (!(await $.ui.panes()).some(p => p.id === 'glowup' && p.isShown)) return
  } catch { return }
  const line = bubbleFor(mood, vars, lastTemplate, Math.random)
  lastTemplate = line.template
  const mine: Bubble = { text: line.text, mood, until: Date.now() + 3000 }
  bubble = mine
  publishPet($)
  $.clock.after(3100, () => { if (bubble === mine) { bubble = undefined; publishPet($) } })
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
  const r = await $.ui.open({ id: 'glowup', title: 'glowup', focus: true, closeOnEscape: true })
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
  })
}

// usage() has no percent before the first response of a session, hence the guard.
// The Plan tab's breakdown is fetched here and cached, not on every pane render
// (the ticker redraws each second).
async function feedContext($: Engine) {
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    const b = u.context.breakdown
    view = { ...view, categories: b?.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })), maxTokens: b?.maxTokens }
    if (u.context.percent !== undefined) feed($, { type: 'context', percent: u.context.percent })
    else publish($)
  } catch {}
}

// A new session id means a new conversation: nothing from the old one carries over.
async function adoptSession($: Engine, endedId: string) {
  const id = await $.session.id()
  model = initialModel()
  view = { tab: 'changes' }
  bubble = undefined
  friday = false
  lastStatusLine = undefined
  refreshSeq++
  // at session.end the id may still be the ending one; turn.start re-checks
  sessionId = id === endedId ? '' : id
  git = await gitBase(hostOf($), cwd)
  syncTicker($)
  redraw($)
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
const BUBBLES: readonly BubbleSetting[] = ['on', 'off']

// The store wins only once a command or the config view wrote it. Without a stored mix, the
// 0.1 settings migrate in memory; only a command writes the result back.
async function initialMix(host: Host, options: Readonly<Record<string, unknown>>): Promise<Mix> {
  const stored = await host.storeGet('mix') as Partial<Mix> | undefined
  if (stored && typeof stored.colors === 'string' && typeof stored.motion === 'string') {
    return { colors: stored.colors, motion: stored.motion, theme: typeof stored.theme === 'string' ? stored.theme : undefined, spinner: typeof stored.spinner === 'string' ? stored.spinner : undefined }
  }
  const pack = typeof options.pack === 'string' && options.pack ? options.pack : DEFAULT_MIX.colors
  const storedTheme = await host.storeGet('theme')
  const theme = typeof storedTheme === 'string' ? storedTheme : typeof options.theme === 'string' && options.theme !== 'classic' ? options.theme : undefined
  return { ...DEFAULT_MIX, colors: pack, motion: pack, theme }
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
    setBubbles: b => { bubbles = b; relook($) },
  }
}

export const register: Register = (on, options) => {
  reducedMotion = options.reducedMotion === true

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    home = (await $.env.get('HOME')) ?? ''
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
    const host = hostOf($)
    await $.command.register({ name: 'glowup', description: 'Themes, the glowup pane and status line', argumentHint: 'theme|pack|import|pet|bubbles|pane|motion|statusline ...' })
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
    await syncTakeover($)
    git = await gitBase(host, cwd)
    // a beat after launch, so the dialog does not open over the startup frame
    if (e.isInteractive) $.clock.after(1500, () => void askFirstRun($))
    // a hot reload restarts this module; the live band and pane must not keep an old snapshot
    publish($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // belt and braces: session.end may have run before the new id was visible
    const id = await $.session.id()
    if (id !== sessionId) await adoptSession($, sessionId)
    newTurnWord()
    friday = false
    feed($, { type: 'turn-start', at: Date.now() })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // without an id the call cannot be matched to its end (an Agent row would never close)
    if (!e.tool_use_id) return next(e)
    const input = e as unknown as Record<string, unknown>
    const toolUseId = e.tool_use_id
    if (!e.agentId && e.tool === 'Bash' && typeof input.command === 'string' && fridayDeploy(input.command, localTime(await $.clock.now(), tzOffset))) friday = true
    feed($, { type: 'tool-start', at: Date.now(), tool: e.tool, toolUseId, agentId: e.agentId, input })
    const ran = await next(e)
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
    return ran
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // without tool_use_id this is a query: nobody is asked
    if (r.decision === 'ask' && e.tool_use_id) {
      feed($, { type: 'needs-you', at: Date.now(), toolUseId: e.tool_use_id, what: approvalLabel(e.tool, e.input as Record<string, unknown>) })
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId && e.tool_use_id) feed($, { type: 'agent-bind', toolUseId: e.tool_use_id, agentId: r.agentId })
    return r
  })

  on('turn.complete', async ($, e, next) => {
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
    // one more redraw after the linger so the band folds away
    $.clock.after(1600, () => publish($))
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || e.trigger === 'precompute' || 'skip' in r) return r
    // usage().context.percent is absent until the next response, so a manual
    // /compact would leave the hearts empty; derive it from the result.
    const u = await $.session.usage()
    const percent = u.context.percent ?? (r.tokensAfter !== undefined && u.context.window > 0 ? Math.round(r.tokensAfter / u.context.window * 100) : 0)
    feed($, { type: 'context', percent })
    return r
  })

  // /clear and resume continue the process under a new session id with no session.start.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await adoptSession($, e.sessionId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    // Asked once. Claude Code places it unasked only from 144 columns (110 once the
    // person has opened it); narrower, it waits and the band shows instead.
    if (e.viewport?.isFullscreen === true && !docked) { docked = true; void $.ui.open({ id: 'glowup', title: 'glowup' }).catch(() => {}) }
    const panes = await $.ui.panes()
    const paneShown = panes.some(p => p.id === 'glowup' && p.isShown && p.isPlaced)
    // Only a docked pane shows the status the band would repeat; an inline one is a short drawer.
    const tier = tierFor(e.props.bodyColumns, paneShown && panePlacement === 'dock')
    const below = await next(e)
    const els = $.ui.resolve(e)
    const live = (await $.state.get(BAND)).value as { model: Model } | undefined
    const mine = renderBand(els, live?.model ?? model, theme, e.props.bodyColumns, tier, Date.now(), { look })
    if (!mine) return below
    // other mods draw bands here too: stack ours on top instead of replacing theirs
    const { Box } = els
    return <Box flexDirection="column">{mine}{below}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: 'glowup' }, async ($, e) => {
    // a render hook cannot write state: publish after the draw
    if (panePlacement !== e.props.placement) { panePlacement = e.props.placement; $.clock.after(0, () => publish($)) }
    const live = (await $.state.get(PANE)).value as { model: Model; view: PaneView } | undefined
    const compact = e.props.placement === 'inline' && e.props.bodyColumns < 80
    const v: PaneView = { ...(live?.view ?? view), reduced: reducedMotion }
    const els = $.ui.resolve(e)
    // the look always applies; the pet and its words only while he is on
    let extra: PaneExtra = { look }
    if (petOn() && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const snap = ((await $.state.get(PET)).value as PetSnap | undefined) ?? petSnap()
      const { Client } = $.ui.resolve(e)
      const props: PetClientProps = { pet: pet as PetId, input: snap.input, overlays: snap.overlays, reduced: reducedMotion, compact, width: petStripCols(e.props.bodyColumns) }
      const node = <Client key="glowup-pet" module="./client/pet.tsx" props={props} />
      const bubbleNow = snap.bubble && snap.bubble.until > Date.now() ? snap.bubble : undefined
      extra = { look, pet: { id: pet as PetId, node, rows: snap.overlays.some(o => HEAD_OUTFITS.includes(o)) ? PET_ROWS + 2 : undefined }, bubble: bubbleNow, friday: snap.friday }
    }
    return renderPane(els, live?.model ?? model, theme, v, e.props.bodyColumns, compact, Date.now(), (id: TabId) => {
      view = { ...view, tab: id }
      publish($)
      if (id === 'plan') void feedContext($)
    }, extra)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
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
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    return styleRow($.ui.resolve(e), look, { site: 'UserMessage', text: p.text, isExpanded: p.isExpanded, own: p.origin.kind === 'composer' && !p.from && !p.task }, row) as RenderElement
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    return styleRow($.ui.resolve(e), look, { site: 'AssistantMessage', isFirstOfReply: e.props.isFirstOfReply }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    return styleRow($.ui.resolve(e), look, { site: 'ToolUse', tool: p.tool, input: p.input, isRunning: p.isRunning, isErrored: p.isErrored, isInterrupted: p.isInterrupted }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    return styleRow($.ui.resolve(e), look, { site: 'ToolResult' }, row) as RenderElement
  })

  on('command.run', { command: 'glowup' }, async ($, e) => {
    const text = await runCommand(hostOf($), e.args, ctlOf($))
    await syncTakeover($)
    return { text }
  })
}
