import type { Host } from './host.ts'
import { safeId } from './instances.ts'
import { agentsRunning, isBusy, type Model } from './model.ts'
import type { Theme } from './themes.ts'

export const SCRIPT_PATH = (configDir: string) => `${configDir}/glowup/statusline.sh`
export const STATUS_DIR = (configDir: string) => `${configDir}/glowup/status`
const SETTINGS = (configDir: string) => `${configDir}/settings.json`
export const BACKUP_KEY = 'statusline-backup'
const NONE = '__none__'

const WORD: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting' }

export function statusText(m: Model, _t: Theme): string | undefined {
  if (!isBusy(m) && !m.ctxPercent) return undefined
  const word = m.working ? (Object.hasOwn(WORD, m.act.glyph) ? WORD[m.act.glyph]! : 'thinking') : agentsRunning(m) ? 'delegating' : 'idle'
  return `◆ ${word} · ctx ${m.ctxPercent}%`
}

// The script prints the line glowup wrote for this session; when that file is
// missing or over 10 minutes old (glowup removed or off) it runs the user's
// original command with the same stdin, so uninstalling never blanks the line.
// Single quotes: the config dir may hold a space, `$` or a backquote.
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const command = (configDir: string) => `sh ${sq(SCRIPT_PATH(configDir))}`

// Invariant: the fallback must never be glowup's own script. Each plugin copy
// has its own store, so a second copy can see the first one's line in
// settings.json and would otherwise back it up as "the user's" command; the
// script would then call itself and fork shells until the machine died.
// The STATUS_DIR test alone catches both paths: ".../glowup/status" is a string
// prefix of ".../glowup/statusline.sh". The other two tests name the intent.
const isOurs = (configDir: string, cmd: unknown) =>
  typeof cmd === 'string' && (cmd === command(configDir) || cmd.includes(SCRIPT_PATH(configDir)) || cmd.includes(STATUS_DIR(configDir)))

// The guard line is a second wall: even a bad fallback exits at the second level.
export function script(configDir: string, original: string) {
  if (isOurs(configDir, original)) original = ''
  return `#!/bin/sh
[ -n "$GLOWUP_STATUSLINE" ] && exit 0; GLOWUP_STATUSLINE=1; export GLOWUP_STATUSLINE
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | tr -cd 'A-Za-z0-9-')
f=${sq(STATUS_DIR(configDir))}/"$sid"
if [ -n "$sid" ] && [ -f "$f" ] && [ -n "$(find "$f" -mmin -10 2>/dev/null)" ]; then cat "$f"; exit 0; fi
${original ? `printf '%s' "$input" | sh -c ${sq(original)}` : 'exit 0'}
`
}

async function readSettings(host: Host): Promise<Record<string, unknown> | undefined> {
  if (!(await host.exists(SETTINGS(host.configDir)))) return {}
  try { const v = JSON.parse(await host.readFile(SETTINGS(host.configDir))); return typeof v === 'object' && v && !Array.isArray(v) ? v : undefined } catch { return undefined }
}

const originalOf = (backup: unknown) =>
  backup !== NONE && typeof backup === 'object' && backup && typeof (backup as { command?: unknown }).command === 'string' ? (backup as { command: string }).command : ''

const OVERRIDE = ' A project or local settings file sets its own statusLine, which wins over this one, so glowup will not show there.'

export async function drawsStatusLine(host: Host): Promise<boolean> {
  const settings = await readSettings(host)
  return isOurs(host.configDir, (settings?.statusLine as { command?: unknown } | undefined)?.command)
}

export async function takeOver(host: Host, ask: (question: string) => Promise<boolean>): Promise<string> {
  const settings = await readSettings(host)
  if (!settings) return `glowup could not read ${SETTINGS(host.configDir)}, so your status line is unchanged.`
  if (await drawsStatusLine(host)) {
    // Another copy of glowup (or an earlier run) already took over. Nothing is
    // backed up from here; only a script that calls itself gets repaired.
    const path = SCRIPT_PATH(host.configDir)
    if ((await host.exists(path)) && (await host.readFile(path)).includes(`sh -c`) && (await host.readFile(path)).includes(path)) {
      await host.writeFile(path, script(host.configDir, originalOf(await host.storeGet(BACKUP_KEY))))
    }
    return 'glowup already draws your status line.'
  }
  const override = (await host.projectStatusLine()) ? OVERRIDE : ''
  if (!(await ask(`Let glowup draw your status line? It edits ${SETTINGS(host.configDir)} and keeps your current one to restore.${override}`))) return 'Your status line is unchanged.'
  if ((await host.storeGet(BACKUP_KEY)) === undefined) await host.storeSet(BACKUP_KEY, settings.statusLine === undefined ? NONE : settings.statusLine)
  await host.writeFile(SCRIPT_PATH(host.configDir), script(host.configDir, originalOf(await host.storeGet(BACKUP_KEY))))
  // re-read just before writing: Claude Code writes this file too
  const fresh = (await readSettings(host)) ?? settings
  await host.writeFile(SETTINGS(host.configDir), JSON.stringify({ ...fresh, statusLine: { type: 'command', command: command(host.configDir) } }, null, 2) + '\n')
  return 'glowup now draws your status line. `/glowup statusline restore` brings yours back.' + override
}

export async function restore(host: Host): Promise<string> {
  const backup = await host.storeGet(BACKUP_KEY)
  if (backup === undefined) return 'Nothing to restore: glowup never replaced your status line.'
  const settings = await readSettings(host)
  if (!settings) return `glowup could not read ${SETTINGS(host.configDir)}; nothing changed.`
  const { statusLine: current, ...rest } = settings
  // Someone set another status line since the takeover: theirs stays. The path
  // match covers the unquoted command older builds wrote; a quote in the config
  // dir is escaped in ours, so that needs the exact match.
  const ours = isOurs(host.configDir, (current as { command?: unknown } | undefined)?.command)
  // A backup that is glowup's own line (stored by the two-copies bug) is no previous line.
  const previous = backup !== NONE && !isOurs(host.configDir, originalOf(backup)) ? { statusLine: backup } : undefined
  if (ours) await host.writeFile(SETTINGS(host.configDir), JSON.stringify(previous ? { ...rest, ...previous } : rest, null, 2) + '\n')
  await host.storeDelete(BACKUP_KEY)
  await host.run(['rm', '-f', SCRIPT_PATH(host.configDir)])
  await host.run(['rm', '-rf', STATUS_DIR(host.configDir)])
  return ours ? 'Your status line is back.' : 'Your status line was changed since; left it as is.'
}

// No line: the file goes, so the script falls back to the person's own command
// instead of printing an empty line.
export async function writeStatusFile(host: Host, sessionId: string, line: string | undefined) {
  const id = safeId(sessionId)
  if (!id) return
  const path = `${STATUS_DIR(host.configDir)}/${id}`
  if (line === undefined) await host.run(['rm', '-f', path])
  else await host.writeFile(path, line)
}
