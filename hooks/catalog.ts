// JSX-free: the docs site may import it.
import type { Host } from './host.ts'
import { parseJsonc, isUnsafe, shown } from './themes.ts'
import { packNameProblem } from './packs.ts'
import { checkThemeText, THEME_DIR } from './userthemes.ts'
import { checkPackText, PACK_DIR } from './userpacks.ts'

export type CatalogEntry = { name: string; description: string; pack: string; themes: string[]; minGlowup: string }

export const CATALOG_URL = 'https://glowup.khimani.dev/packs.json'
export const CATALOG_FILE = (configDir: string) => `${configDir}/glowup/catalog.json`

// The pack subcommands: a pack with one of these names could never be picked by name.
const RESERVED = ['list', 'save', 'update']
const MAX_ENTRIES = 100
const VERSION = /^\d+(\.\d+)*$/
const isHttps = (v: unknown): v is string => typeof v === 'string' && v.startsWith('https://')
const printable = (s: string) => [...s].every(c => !isUnsafe(c.codePointAt(0)!))

function entryOf(v: unknown): CatalogEntry | string {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'an entry is not an object'
  const e = v as Record<string, unknown>
  const name = typeof e.name === 'string' ? e.name : ''
  const label = `entry "${shown(name)}"`
  const problem = packNameProblem(name) ?? (RESERVED.includes(name) ? `"${name}" is a /glowup pack subcommand` : undefined)
  if (problem) return `${label}: ${problem}`
  if (typeof e.description !== 'string' || e.description.length > 80 || !printable(e.description)) return `${label}: description must be printable text of at most 80 characters`
  if (!isHttps(e.pack)) return `${label}: pack must be an https:// URL`
  const themes = e.themes ?? []
  if (!Array.isArray(themes) || !themes.every(isHttps)) return `${label}: themes must be https:// URLs`
  if (typeof e.minGlowup !== 'string' || !VERSION.test(e.minGlowup)) return `${label}: minGlowup must be a version such as 0.10.0`
  return { name, description: e.description, pack: e.pack, themes, minGlowup: e.minGlowup }
}

export function parseCatalog(json: unknown): { entries: CatalogEntry[]; errors: string[] } | undefined {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined
  const { format, packs } = json as { format?: unknown; packs?: unknown }
  if (format !== 1 || !Array.isArray(packs)) return undefined
  const entries: CatalogEntry[] = [], errors: string[] = []
  for (const p of packs.slice(0, MAX_ENTRIES)) {
    const e = entryOf(p)
    if (typeof e === 'string') errors.push(e)
    else if (entries.some(x => x.name === e.name)) errors.push(`entry "${e.name}" is listed twice; the first is kept`)
    else entries.push(e)
  }
  return { entries, errors }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

// A glowup that cannot read its own version runs no catalog pack: it may be older than any of them.
export const canRun = (entry: CatalogEntry, own: string | undefined) =>
  own !== undefined && VERSION.test(own) && compareVersions(own, entry.minGlowup) >= 0

export async function loadCatalog(host: Host): Promise<CatalogEntry[]> {
  try { return parseCatalog(parseJsonc(await host.readFile(CATALOG_FILE(host.configDir))))?.entries ?? [] } catch { return [] }
}

export async function refreshCatalog(host: Host): Promise<CatalogEntry[] | undefined> {
  let r: Awaited<ReturnType<Host['fetchText']>>
  try { r = await host.fetchText(CATALOG_URL) } catch { return undefined }
  if (!r.ok) return undefined
  let parsed: ReturnType<typeof parseCatalog>
  try { parsed = parseCatalog(parseJsonc(r.text)) } catch { return undefined }
  if (!parsed) return undefined
  await host.writeFile(CATALOG_FILE(host.configDir), r.text)
  return parsed.entries
}

export const RECORD_FILE = (configDir: string) => `${configDir}/glowup/catalog-installed.json`
export type CatalogRecord = { packs: Record<string, { url: string; hash: string }>; themes: Record<string, { hash: string }> }

// FNV-1a: detects "the file is still what glowup wrote", not tampering.
export function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export async function loadRecord(host: Host): Promise<CatalogRecord> {
  const out: CatalogRecord = { packs: {}, themes: {} }
  let v: any
  try { v = parseJsonc(await host.readFile(RECORD_FILE(host.configDir))) } catch { return out }
  for (const [k, p] of Object.entries(v?.packs ?? {})) if (typeof (p as any)?.url === 'string' && typeof (p as any)?.hash === 'string') out.packs[k] = { url: (p as any).url, hash: (p as any).hash }
  for (const [k, t] of Object.entries(v?.themes ?? {})) if (typeof (t as any)?.hash === 'string') out.themes[k] = { hash: (t as any).hash }
  return out
}

async function download(host: Host, url: string, what: string): Promise<string | { message: string }> {
  try {
    const r = await host.fetchText(url)
    return r.ok ? r.text : { message: `Could not download ${what} (HTTP ${r.status}).` }
  } catch (err) { return { message: `Could not download ${what}: ${err instanceof Error ? err.message : String(err)}` } }
}

// Unchanged since glowup wrote it: the only state in which glowup may replace a file.
async function untouched(host: Host, path: string, hash: string | undefined) {
  if (hash === undefined) return false
  try { return textHash(await host.readFile(path)) === hash } catch { return false }
}

// Everything is downloaded and checked before the first write, so a refused install leaves no file behind.
export async function installEntry(host: Host, entry: CatalogEntry, opts: { force: boolean }): Promise<{ name?: string; message: string }> {
  const packText = await download(host, entry.pack, entry.name)
  if (typeof packText !== 'string') return packText
  let named: unknown
  try { named = (parseJsonc(packText) as { name?: unknown } | null)?.name } catch { named = undefined }
  if (typeof named !== 'string' || named.toLowerCase() !== entry.name) return { message: `The catalog's ${entry.name} downloads a pack named "${shown(String(named))}"; nothing was installed.` }
  const record = await loadRecord(host)
  const themes: { name: string; text: string; file: unknown }[] = []
  for (const url of entry.themes) {
    const text = await download(host, url, `${entry.name}'s theme`)
    if (typeof text !== 'string') return text
    const checked = await checkThemeText(host, text, Object.fromEntries(themes.map(t => [t.name, t.file])))
    if ('error' in checked) return { message: `${entry.name}: ${checked.error}` }
    themes.push({ name: checked.name, text, file: checked.file })
  }
  const pack = await checkPackText(host, packText, opts.force, Object.fromEntries(themes.map(t => [t.name, t.file])))
  if ('message' in pack) return pack
  const dir = THEME_DIR(host.configDir)
  for (const t of themes) {
    const path = `${dir}/${t.name}.json`
    const own = Object.hasOwn(record.themes, t.name) ? record.themes[t.name]!.hash : undefined
    if (await host.exists(path) && !(opts.force && await untouched(host, path, own))) continue
    await host.writeFile(path, t.text)
    record.themes[t.name] = { hash: textHash(t.text) }
  }
  await host.writeFile(`${PACK_DIR(host.configDir)}/${pack.name}.json`, packText)
  record.packs[pack.name] = { url: entry.pack, hash: textHash(packText) }
  await host.writeFile(RECORD_FILE(host.configDir), JSON.stringify(record, null, 2) + '\n')
  return { name: pack.name, message: `Installed pack "${pack.name}".` }
}
