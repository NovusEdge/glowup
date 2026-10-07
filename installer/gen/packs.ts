// Writes installer/internal/packs/packs.json from the mod's pack presets.
// It also lists the official catalog from docs/web/public/packs.json.
// `--check` compares instead of writing, so CI fails when packpresets.ts or the index changed and the JSON did not.
import { readFileSync, writeFileSync } from 'node:fs'
import { packsJson } from '../../hooks/packexport.ts'

const out = new URL('../internal/packs/packs.json', import.meta.url)
const index = JSON.parse(readFileSync(new URL('../../docs/web/public/packs.json', import.meta.url), 'utf8'))
const built = JSON.parse(packsJson())
built.catalog = index.packs.map(({ name, description }: { name: string; description: string }) => ({ name, description }))
const want = JSON.stringify(built, null, 2) + '\n'

if (process.argv.includes('--check')) {
  let have = ''
  try { have = readFileSync(out, 'utf8') } catch {}
  if (have !== want) {
    console.error('installer/internal/packs/packs.json is stale: run `just packs` and commit the result')
    process.exit(1)
  }
} else {
  writeFileSync(out, want)
}
