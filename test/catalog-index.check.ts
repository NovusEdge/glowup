// Run by `pnpm test` under node: the engine's test runner cannot read files in the repo.
import { readFileSync } from 'node:fs'
import { parseCatalog, compareVersions } from '../hooks/catalog.ts'

const dir = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '')).replace(/[^/]*$/, '')
const index = JSON.parse(readFileSync(`${dir}../docs/web/public/packs.json`, 'utf8'))
const own = JSON.parse(readFileSync(`${dir}../.claude-plugin/plugin.json`, 'utf8')).version as string
const parsed = parseCatalog(index)
const fail = (m: string): never => { throw new Error(`docs/web/public/packs.json: ${m}`) }
if (!parsed) fail('not a format 1 index')
if (parsed!.errors.length) fail(parsed!.errors.join('; '))
if (parsed!.entries.length !== index.packs.length) fail('an entry was dropped')
for (const e of parsed!.entries) if (compareVersions(e.minGlowup, own) > 0) fail(`${e.name} needs glowup ${e.minGlowup}, newer than this ${own}`)
