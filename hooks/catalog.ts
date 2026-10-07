// JSX-free: the docs site may import it.
import type { Host } from './host.ts'
import { parseJsonc, isUnsafe, shown } from './themes.ts'
import { packNameProblem } from './packs.ts'

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
