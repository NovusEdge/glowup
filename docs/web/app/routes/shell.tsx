import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

// Injected by vite.config.ts. A layout route cannot have a loader when prerendering with ssr: false.
const pages = __NAV__

const pathOf = (slug: string) => `/${slug}`

// The guides: a side menu, the page, and its table of contents.
export default function Shell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const groups: { section: string; items: typeof pages }[] = []
  for (const p of pages) {
    const g = groups.find(x => x.section === p.section)
    if (g) g.items.push(p)
    else groups.push({ section: p.section, items: [p] })
  }

  return (
    <>
      <div className="sticky top-14 z-30 border-b border-(--line) bg-(--bg)/80 px-4 py-2 backdrop-blur-md md:hidden">
        <button type="button" className="btn-ico w-auto gap-2 px-3 text-sm" aria-expanded={open} aria-controls="sidenav" onClick={() => setOpen(o => !o)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          Guides
        </button>
      </div>

      {open && <div className="drawer-scrim md:hidden" onClick={() => setOpen(false)} />}

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-x-10 px-4 pb-12 pt-8 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_200px]">
        <nav id="sidenav" aria-label="Docs" data-open={open} className="sidenav space-y-7 text-sm md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto">
          {groups.map(g => (
            <div key={g.section}>
              <p className="label mb-2">{g.section}</p>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {g.items.map(i => (
                  <li key={i.slug}>
                    <NavLink to={pathOf(i.slug)} end className={({ isActive }) => (isActive ? 'cur' : '')}>{i.title}</NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="contents">
          <Outlet />
        </div>
      </div>
    </>
  )
}
