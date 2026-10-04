import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'

// The guides are the Markdown files directly in docs/, so GitHub and the site show the same text.
// The landing page at `/` is a component, not a guide. Paths are relative to the working
// directory, which is docs/web for every script: the server bundle loads this module from
// build/server, so import.meta.url would point there.
export const CONTENT_DIR = pathToFileURL(resolve('..') + '/')

export const slugs = (): string[] =>
  readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort()

export const pathOf = (slug: string) => `/${slug}`
export const allPaths = () => ['/', ...slugs().map(pathOf)]

export type Meta = { title: string; description: string; order: number; section: string }

export function readMetas(): (Meta & { slug: string })[] {
  return slugs()
    .map(slug => {
      const raw = readFileSync(new URL(`${slug}.md`, CONTENT_DIR), 'utf8')
      const m = /^---\n([\s\S]*?)\n---/.exec(raw)
      if (!m) throw new Error(`${slug}.md has no frontmatter`)
      return { slug, ...(parse(m[1]!) as Meta) }
    })
    .sort((a, b) => a.order - b.order)
}
