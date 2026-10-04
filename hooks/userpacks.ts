import type { Host } from './host.ts'
import { parseJsonc } from './themes.ts'
import { loadUserThemes } from './userthemes.ts'
import { resolveLook, validatePack, type PackFile } from './packs.ts'
import { PACKS } from './packpresets.ts'

export const PACK_DIR = (configDir: string) => `${configDir}/glowup/packs`
export const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_BYTES = 65536

export async function loadUserPacks(host: Host): Promise<Record<string, unknown>> {
  const dir = PACK_DIR(host.configDir)
  if (!(await host.exists(dir))) return {}
  const out: Record<string, unknown> = {}
  for (const f of await host.listDir(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -5)
    try { out[name] = parseJsonc(await host.readFile(`${dir}/${f}`)) } catch (err) { out[name] = err instanceof Error ? err : new Error(String(err)) }
  }
  return out
}

const msg = (err: unknown) => err instanceof Error ? err.message : String(err)

// Shared by addPack and savePack: a refusal message, or undefined when the name may be written.
async function nameProblem(host: Host, name: string, force: boolean): Promise<string | undefined> {
  if (!SAFE_NAME.test(name)) return 'A pack needs a "name" of lowercase letters, digits and dashes.'
  if (Object.hasOwn(PACKS, name)) return `"${name}" is a built-in pack name; pick another.`
  if (!force && (await host.exists(`${PACK_DIR(host.configDir)}/${name}.json`))) return `A pack named "${name}" is installed already. Add --force to replace it.`
  return undefined
}

export async function addPack(host: Host, url: string, force: boolean): Promise<{ name?: string; message: string }> {
  if (!url.startsWith('https://')) return { message: 'Pack URLs must start with https://' }
  let r: Awaited<ReturnType<Host['fetchText']>>
  try { r = await host.fetchText(url) } catch (err) { return { message: `Could not download the pack: ${msg(err)}` } }
  if (!r.ok) return { message: `Could not download the pack (HTTP ${r.status}).` }
  if (r.text.length > MAX_BYTES) return { message: 'The pack is over 64 KB.' }
  let file: unknown
  try { file = parseJsonc(r.text); validatePack(file) } catch (err) { return { message: msg(err) } }
  const name = file.name.toLowerCase()
  const problem = await nameProblem(host, name, force)
  if (problem) return { message: problem }
  const check = resolveLook({ colors: name, motion: name }, { ...(await loadUserPacks(host)), [name]: file }, await loadUserThemes(host))
  if (check.errors.length) return { message: check.errors[0]! }
  await host.writeFile(`${PACK_DIR(host.configDir)}/${name}.json`, r.text)
  return { name, message: `Installed pack "${name}". Apply it with /glowup pack ${name}` }
}

export async function savePack(host: Host, file: PackFile, force = false): Promise<string> {
  try { validatePack(file) } catch (err) { return msg(err) }
  const problem = await nameProblem(host, file.name, force)
  if (problem) return problem
  const path = `${PACK_DIR(host.configDir)}/${file.name}.json`
  await host.writeFile(path, JSON.stringify(file, null, 2) + '\n')
  return `Saved pack "${file.name}" to ${path}. Apply it with /glowup pack ${file.name}, or share the file.`
}
