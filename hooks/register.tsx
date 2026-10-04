import type { EngineInterface, Register, Timer } from 'claude-code'
import type { Host } from './host.ts'
import { initialModel, applyEvent, mergeCounts, type Model, type Ev } from './model.ts'
import { resolveTheme, type Theme } from './themes.ts'
import { gitBase, refreshCounts } from './changes.ts'
import { tierFor } from './layout.tsx'
import { renderBand } from './band.tsx'
import { renderPane, type PaneView, type TabId } from './pane.tsx'
import { spinnerWord, newTurnWord, toolGlyph } from './restyle.ts'
import { statusText, writeStatusFile, BACKUP_KEY } from './statusline.ts'
import { runCommand, type Ctl } from './command.ts'
import { loadUserThemes } from './userthemes.ts'

type Engine = EngineInterface

// Module state: one session per process. A hot reload starts it over, which only
// loses the in-flight session's view (settings and takeover state live in $.store).
let model: Model = initialModel()
let theme: Theme = resolveTheme('classic', {}).theme
let view: PaneView = { tab: 'changes' }
let git: { root: string; base: string } | undefined
let cwd = ''
let configDir = ''
let reducedMotion = false
let docked = false
// Where the surface seated the pane, learned from its last render: panes() does not say.
let panePlacement: 'dock' | 'inline' | undefined
let ticker: Timer | undefined
let refreshSeq = 0
let sessionId = ''
let takenOver = false
let statusTimer: Timer | undefined
let lastStatusLine: string | undefined

function hostOf($: Engine): Host {
  return {
    run: async argv => { const r = await $.process.run(argv); return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr } },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDir: async path => (await $.fs.list(path)).map(e => e.name),
    fetchText: async url => { const r = await $.http.fetch(url); return { ok: r.ok, status: r.status, text: r.text } },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    projectStatusLine: async () =>
      (await $.settings.read({ source: 'project' })).statusLine !== undefined ||
      (await $.settings.read({ source: 'local' })).statusLine !== undefined,
    configDir,
  }
}

// The takeover script falls back to the person's own command once this file is
// 10 minutes old, so a quiet session still rewrites it every minute.
function writeStatus($: Engine, force: boolean) {
  const line = statusText(model, theme) ?? ''
  if (!takenOver || !sessionId || (!force && line === lastStatusLine)) return
  lastStatusLine = line
  void writeStatusFile(hostOf($), sessionId, line).catch(() => {})
}
async function syncTakeover($: Engine) {
  takenOver = (await hostOf($).storeGet(BACKUP_KEY)) !== undefined
  statusTimer?.cancel()
  statusTimer = takenOver ? $.clock.every(60_000, () => writeStatus($, true)) : undefined
  writeStatus($, true)
}

function redraw($: Engine) {
  $.ui.invalidate('ui.render')
  $.ui.status(statusText(model, theme))
  writeStatus($, false)
}
function feed($: Engine, ev: Ev) { model = applyEvent(model, ev); redraw($) }

async function togglePane($: Engine): Promise<string> {
  const open = (await $.ui.panes()).find(p => p.id === 'glowup')
  if (open?.isShown) { await $.ui.close({ id: 'glowup' }); return 'glowup pane closed' }
  const r = await $.ui.open({ id: 'glowup', title: 'glowup', focus: true, closeOnEscape: true })
  return r.isPlaced ? 'glowup pane open (Esc closes it)' : `glowup pane waits: ${r.reason}`
}

// Not awaited by callers: git must not hold up a tool result. Only the newest
// refresh lands, so a slow older one can't overwrite newer counts.
function refresh($: Engine) {
  const seq = ++refreshSeq
  void refreshCounts(hostOf($), model.files, git).then(files => {
    if (seq !== refreshSeq) return
    model = mergeCounts(model, files)
    redraw($)
  }).catch(() => {})
}

// usage() has no percent before the first response of a session, hence the guard.
async function feedContext($: Engine) {
  try {
    const u = await $.session.usage()
    if (u.context.percent !== undefined) feed($, { type: 'context', percent: u.context.percent })
  } catch {}
}

// A new session id means a new conversation: nothing from the old one carries over.
async function adoptSession($: Engine, endedId: string) {
  const id = await $.session.id()
  model = initialModel()
  view = { tab: 'changes' }
  lastStatusLine = undefined
  refreshSeq++
  // at session.end the id may still be the ending one; turn.start re-checks
  sessionId = id === endedId ? '' : id
  git = await gitBase(hostOf($), cwd)
  redraw($)
}

function ctlOf($: Engine): Ctl {
  return {
    setTheme: async name => { theme = resolveTheme(name, await loadUserThemes(hostOf($))).theme; redraw($) },
    togglePane: () => togglePane($),
    setMotion: reduced => { reducedMotion = reduced; redraw($) },
    // ask rejects when the person dismisses the dialog; that counts as No
    confirm: async question => (await $.ui.ask(question, ['Yes', 'No']).catch(() => 'No')) === 'Yes',
  }
}

export const register: Register = (on, options) => {
  reducedMotion = options.reducedMotion === true

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? ''}/.claude`
    const host = hostOf($)
    await $.command.register({ name: 'glowup', description: 'Themes, the glowup pane and status line', argumentHint: 'theme|pane|motion|statusline ...' })
    const chosen = String((await host.storeGet('theme')) ?? options.theme ?? 'classic')
    const r = resolveTheme(chosen, await loadUserThemes(host))
    theme = r.theme
    if (r.error) $.ui.toast(r.error)
    const motion = await host.storeGet('reducedMotion')
    if (typeof motion === 'boolean') reducedMotion = motion
    sessionId = await $.session.id()
    await syncTakeover($)
    git = await gitBase(host, cwd)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // belt and braces: session.end may have run before the new id was visible
    const id = await $.session.id()
    if (id !== sessionId) await adoptSession($, sessionId)
    newTurnWord()
    feed($, { type: 'turn-start', at: Date.now() })
    // elapsed times and agent spinners change with no event behind them
    ticker?.cancel()
    ticker = $.clock.every(1000, () => redraw($))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // without an id the call cannot be matched to its end (an Agent row would never close)
    if (!e.tool_use_id) return next(e)
    const input = e as unknown as Record<string, unknown>
    const toolUseId = e.tool_use_id
    feed($, { type: 'tool-start', at: Date.now(), tool: e.tool, toolUseId, agentId: e.agentId, input })
    const ran = await next(e)
    const denied = ran.deny !== undefined
    const result = denied || ran.isError ? undefined : ran.result as unknown as { task?: { id?: unknown }; totalTokens?: unknown; type?: unknown } | undefined
    feed($, {
      type: 'tool-end', at: Date.now(), tool: e.tool, toolUseId, agentId: e.agentId, input,
      isError: denied || ran.isError === true, text: ran.text ?? ran.deny ?? '',
      resultTaskId: e.tool === 'TaskCreate' && result?.task?.id !== undefined ? String(result.task.id) : undefined,
      agentTokens: e.tool === 'Agent' && typeof result?.totalTokens === 'number' ? result.totalTokens : undefined,
      writeType: e.tool === 'Write' && (result?.type === 'create' || result?.type === 'update') ? result.type : undefined,
    })
    if (!denied && !e.agentId && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit' || e.tool === 'Bash')) refresh($)
    if (!e.agentId) void feedContext($)
    return ran
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // without tool_use_id this is a query: nobody is asked
    if (r.decision === 'ask' && e.tool_use_id) {
      const what = e.tool === 'Bash' ? `approve ${String((e.input as { command?: string }).command ?? '').slice(0, 40)}` : `approve ${e.tool}`
      feed($, { type: 'needs-you', at: Date.now(), toolUseId: e.tool_use_id, what })
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId && e.tool_use_id) feed($, { type: 'agent-bind', toolUseId: e.tool_use_id, agentId: r.agentId })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    // the ticker would redraw through the whole wait for next()
    if (!e.agentId) { ticker?.cancel(); ticker = undefined }
    const r = await next(e)
    if (e.agentId) { feed($, { type: 'agent-done', at: Date.now(), agentId: e.agentId }); refresh($); return r }
    feed($, { type: 'turn-done', at: Date.now() })
    refresh($)
    await feedContext($)
    // one more redraw after the linger so the band folds away
    $.clock.after(1600, () => redraw($))
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
    const mine = renderBand(els, model, theme, e.props.bodyColumns, tier, Date.now())
    if (!mine) return below
    // other mods draw bands here too: stack ours on top instead of replacing theirs
    const { Box } = els
    return <Box flexDirection="column">{mine}{below}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: 'glowup' }, async ($, e) => {
    if (view.tab === 'plan') {
      const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
      view = { ...view, categories: b?.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })), maxTokens: b?.maxTokens }
    }
    if (panePlacement !== e.props.placement) { panePlacement = e.props.placement; $.ui.invalidate('ui.render') }
    const compact = e.props.placement === 'inline' && e.props.bodyColumns < 80
    const v: PaneView = { ...view, reduced: reducedMotion }
    return renderPane($.ui.resolve(e), model, theme, v, e.props.bodyColumns, compact, Date.now(), (id: TabId) => { view = { ...view, tab: id }; $.ui.invalidate('ui.render') })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => next({ ...e, props: { ...e.props, word: spinnerWord(theme, e.props.word, reducedMotion) } }))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    const g = !e.props.isRunning && toolGlyph(theme, e.props.tool)
    if (!g) return row
    const { Box, Text } = $.ui.resolve(e)
    return <Box flexDirection="row">{row}<Text color={g.color}>{'  ' + g.glyph}</Text></Box>
  })

  on('command.run', { command: 'glowup' }, async ($, e) => {
    const text = await runCommand(hostOf($), e.args, ctlOf($))
    await syncTakeover($)
    return { text }
  })
}
