// Writes installer/internal/packs/packs.json from the mod's pack presets.
// `--check` compares instead of writing, so CI fails when packpresets.ts changed and the JSON did not.
import { readFileSync, writeFileSync } from 'node:fs'
import { packsJson } from '../../hooks/packexport.ts'

const out = new URL('../internal/packs/packs.json', import.meta.url)
const want = packsJson()

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
