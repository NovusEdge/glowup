import { GLYPH_KEYS, PRESETS, type Look } from '../landing/data.ts'
import { setBaseTheme, setGlyph, setHearts, setWords, type Draft } from './model.ts'
import { Select, TextField } from './ui'

const ONE_CELL = 'Use one character that is one cell wide.'
const THEMES = Object.keys(PRESETS)

export function ThemeSection({ draft, look, onDraft }: { draft: Draft; look: Look; onDraft(d: Draft): void }) {
  const { glyphs, hearts, spinnerWords } = look.theme
  const commit = (next: Draft | undefined, error: string) => {
    if (!next) return error
    onDraft(next)
  }
  return (
    <>
      <Select label="Base theme" value={draft.colors.theme ?? 'classic'} options={THEMES} onChange={t => onDraft(setBaseTheme(draft, t))} />
      <p className="hint">Picking a base theme replaces your colors, glyphs and words with that theme's.</p>
      <div role="group" aria-labelledby="th-glyphs">
        <h3 id="th-glyphs">Glyphs</h3>
        <div className="glyphs">
          {GLYPH_KEYS.map(k => (
            <TextField key={k} label={k} value={glyphs[k]} size={3} onCommit={t => commit(setGlyph(draft, k, t), ONE_CELL)} />
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby="th-hearts">
        <h3 id="th-hearts">Hearts</h3>
        <div className="glyphs">
          <TextField label="full" value={hearts[0]} size={3} onCommit={t => commit(setHearts(draft, t, hearts[1]), ONE_CELL)} />
          <TextField label="empty" value={hearts[1]} size={3} onCommit={t => commit(setHearts(draft, hearts[0], t), ONE_CELL)} />
        </div>
      </div>
      <div role="group" aria-labelledby="th-words">
        <h3 id="th-words">Spinner words</h3>
        <TextField label="Comma-separated" value={spinnerWords.join(', ')} onCommit={t => commit(setWords(draft, t), 'Add at least one word, each up to 24 printable characters.')} />
      </div>
    </>
  )
}
