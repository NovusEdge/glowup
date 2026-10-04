import type { Host } from './host.ts'
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'

export const SCRIPT_PATH = (configDir: string) => `${configDir}/glowup/statusline.sh`
export const STATUS_DIR = (configDir: string) => `${configDir}/glowup/status`
const SETTINGS = (configDir: string) => `${configDir}/settings.json`
export const BACKUP_KEY = 'statusline-backup'
const NONE = '__none__'

const WORD: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting' }

export function statusText(m: Model, _t: Theme): string | undefined {
  if (!m.working && !m.ctxPercent) return undefined
  const word = m.working ? (Object.hasOwn(WORD, m.act.glyph) ? WORD[m.act.glyph]! : 'thinking') : 'idle'
  return `◆ ${word} · ctx ${m.ctxPercent}%`
}

// The script prints the line glowup wrote for this session; when that file is
// missing or over 10 minutes old (glowup removed or off) it runs the user's
// original command with the same stdin, so uninstalling never blanks the line.
function script(configDir: string, original: string) {
  const q = original.replace(/'/g, `'\\''`)
  return `#!/bin/sh
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')
f="${STATUS_DIR(configDir)}/$sid"
if [ -n "$sid" ] && [ -f "$f" ] && [ -n "$(find "$f" -mmin -10 2>/dev/null)" ]; then cat "$f"; exit 0; fi
${original ? `printf '%s' "$input" | sh -c '${q}'` : 'exit 0'}
`
}

async function readSettings(host: Host): Promise<Record<string, unknown> | undefined> {
  if (!(await host.exists(SETTINGS(host.configDir)))) return {}
  try { const v = JSON.parse(await host.readFile(SETTINGS(host.configDir))); return typeof v === 'object' && v && !Array.isArray(v) ? v : undefined } catch { return undefined }
}

const OVERRIDE = ' A project or local settings file sets its own statusLine, which wins over this one, so glowup will not show there.'

export async function takeOver(host: Host, ask: (question: string) => Promise<boolean>): Promise<string> {
  const settings = await readSettings(host)
  if (!settings) return `glowup could not read ${SETTINGS(host.configDir)}, so your status line is unchanged.`
  const override = (await host.projectStatusLine()) ? OVERRIDE : ''
  if (!(await ask(`Let glowup draw your status line? It edits ${SETTINGS(host.configDir)} and keeps your current one to restore.${override}`))) return 'Your status line is unchanged.'
  if ((await host.storeGet(BACKUP_KEY)) === undefined) await host.storeSet(BACKUP_KEY, settings.statusLine === undefined ? NONE : settings.statusLine)
  const backup = await host.storeGet(BACKUP_KEY)
  const original = backup !== NONE && typeof backup === 'object' && backup ? ((c: unknown) => (typeof c === 'string' ? c : ''))((backup as { command?: unknown }).command) : ''
  await host.writeFile(SCRIPT_PATH(host.configDir), script(host.configDir, original))
  // re-read just before writing: Claude Code writes this file too
  const fresh = (await readSettings(host)) ?? settings
  await host.writeFile(SETTINGS(host.configDir), JSON.stringify({ ...fresh, statusLine: { type: 'command', command: `sh ${SCRIPT_PATH(host.configDir)}` } }, null, 2) + '\n')
  return 'glowup now draws your status line. `/glowup statusline restore` brings yours back.' + override
}

export async function restore(host: Host): Promise<string> {
  const backup = await host.storeGet(BACKUP_KEY)
  if (backup === undefined) return 'Nothing to restore: glowup never replaced your status line.'
  const settings = await readSettings(host)
  if (!settings) return `glowup could not read ${SETTINGS(host.configDir)}; nothing changed.`
  const { statusLine: _drop, ...rest } = settings
  await host.writeFile(SETTINGS(host.configDir), JSON.stringify(backup === NONE ? rest : { ...rest, statusLine: backup }, null, 2) + '\n')
  await host.storeDelete(BACKUP_KEY)
  await host.run(['rm', '-f', SCRIPT_PATH(host.configDir)])
  return 'Your status line is back.'
}

export async function writeStatusFile(host: Host, sessionId: string, line: string) {
  await host.writeFile(`${STATUS_DIR(host.configDir)}/${sessionId}`, line)
}
