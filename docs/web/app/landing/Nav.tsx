import './landing.css'

export function Nav() {
  return (
    <nav className="float" aria-label="Main">
      <a className="logo" href="/">glow<span>up</span></a>
      <a href="/install">Docs</a>
      <a href="/themes">Themes</a>
      <a className="hide-sm" href="https://github.com/NovusEdge/glowup/blob/main/CHANGELOG.md">Changelog</a>
      <a className="gh" href="https://github.com/NovusEdge/glowup">★ GitHub</a>
    </nav>
  )
}
