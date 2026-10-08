import { StarIcon } from '../ui/icons'
import './landing.css'

export function Nav() {
  return (
    <nav className="float" aria-label="Main">
      <a className="logo" href="/">glow<span>up</span></a>
      <a className="nav-link" href="/install">Docs</a>
      <a className="nav-link" href="/themes">Themes</a>
      <a className="nav-link" href="/studio">Studio</a>
      <a className="nav-link hide-sm" href="https://github.com/NovusEdge/glowup/blob/main/CHANGELOG.md">Changelog</a>
      <a className="btn btn-secondary btn-sm" href="https://github.com/NovusEdge/glowup"><StarIcon />GitHub</a>
    </nav>
  )
}
