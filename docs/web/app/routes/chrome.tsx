import { Link, Outlet } from 'react-router'
import { Search } from '../search'
import { ThemeToggle } from '../theme'
import { REPO } from '../site'

// The header and footer shared by the landing page and the guides.
export default function Chrome() {
  return (
    <>
      <a href="#content" className="skip">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-(--line) bg-(--bg)/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="glowup home" className="font-(family-name:--font-display) text-xl font-black tracking-tight">
            glow<span className="text-(--accent)">up</span>
          </Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-5 text-sm text-(--muted) sm:flex">
            <Link to="/install" className="hover:text-(--fg)">Docs</Link>
            <Link to="/themes" className="hover:text-(--fg)">Themes</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <a href={REPO} className="hidden text-sm text-(--muted) hover:text-(--fg) sm:block">GitHub</a>
            <Search />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="content">
        <Outlet />
      </main>

      <footer className="border-t border-(--line)">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-8 text-sm text-(--muted) sm:px-6">
          <span>MIT license</span>
          <a href={REPO} className="hover:text-(--fg)">GitHub</a>
        </div>
      </footer>
    </>
  )
}
