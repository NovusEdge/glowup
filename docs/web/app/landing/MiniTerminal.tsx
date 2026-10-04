import type { CSSProperties } from 'react'

export function MiniTerminal(props: { word: string; rows?: string; style?: CSSProperties }) {
  return (
    <div className="mini" data-rows={props.rows} style={props.style}>
      <div className="bl">
        <span style={{ color: 'var(--accent)' }}>✻</span>
        <span className="w">{props.word}…</span>
        <span style={{ color: 'var(--faint)' }}>·</span>
        <span style={{ color: 'var(--edit)' }}>✎ Editing src/auth.ts</span>
        <span style={{ color: 'var(--fail)' }}>♥♥♥♥<span style={{ color: 'var(--faint)' }}>♡</span></span>
      </div>
      <div className="row k-read"><span className="dot">●</span><span className="g">▸</span><span className="verb">Read</span><span className="tgt">src/auth.ts</span></div>
      <div className="row k-edit"><span className="dot">●</span><span className="g">✎</span><span className="verb">Update</span><span className="tgt">src/auth.ts</span><span className="meta">+9 −2</span></div>
      <div className="diff">
        <div className="dl del">- return {'{'} redirect: next {'}'}</div>
        <div className="dl add">+ return {'{'} redirect: safeNext(next) {'}'}</div>
      </div>
      <div className="row k-shell"><span className="dot">●</span><span className="g">$</span><span className="verb">Bash</span><span className="tgt">pnpm test</span></div>
      <div className="res ok">✓ 5 passed</div>
    </div>
  )
}
