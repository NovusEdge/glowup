import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'

// Plain Node on purpose: react-router.config.ts and scripts/* import this, and they cannot load the
// Vite-fed fumadocs source. Paths are relative to docs/web, the working directory for every script.
export const CONTENT_DIR = pathToFileURL(resolve(process.env.GLOWUP_DOCS_DIR ?? '..') + '/')

export type Guide = { slug: string; title: string; description: string }

export const slugs = (): string[] => guides().map(g => g.slug)
export const pathOf = (slug: string) => `/${slug}`
export const allPaths = () => ['/', '/studio', ...slugs().map(pathOf)]

export function guides(): Guide[] {
  const order = (JSON.parse(readFileSync(new URL('meta.json', CONTENT_DIR), 'utf8')).pages as string[]).filter(p => !p.startsWith('---'))
  const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
  const missing = files.filter(f => !order.includes(f))
  if (missing.length) throw new Error(`docs/meta.json does not list: ${missing.join(', ')}`)
  return order.map(slug => {
    const raw = readFileSync(new URL(`${slug}.md`, CONTENT_DIR), 'utf8')
    const m = /^---\n([\s\S]*?)\n---/.exec(raw)
    if (!m) throw new Error(`${slug}.md has no frontmatter`)
    const fm = parse(m[1]!) as { title?: string; description?: string }
    if (!fm.title || !fm.description) throw new Error(`${slug}.md needs title and description`)
    return { slug, title: fm.title, description: fm.description }
  })
}
