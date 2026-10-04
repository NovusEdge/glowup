import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allPaths } from '../pages.ts'

// api/search is a resource route: prerendering writes it as a bare file, not a directory.
const fileOf = (root: string, route: string) => {
  const clean = route.replace(/\/$/, '')
  return clean === '/api/search' || /\.[a-z0-9]+$/i.test(posix.basename(clean)) ? join(root, clean) : join(root, clean, 'index.html')
}

export function checkSite(root: string, paths: string[]): string[] {
  const problems: string[] = []

  for (const path of paths) {
    if (!existsSync(fileOf(root, path))) problems.push(`no prerendered HTML for ${path}`)
  }
  const search = join(root, 'api/search')
  if (!existsSync(search)) problems.push('build output is missing api/search')
  else {
    try { JSON.parse(readFileSync(search, 'utf8')) } catch { problems.push('api/search is not JSON') }
  }

  const htmlFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return name === 'assets' ? [] : htmlFiles(p)
      return name.endsWith('.html') ? [p] : []
    })

  const idsCache = new Map<string, Set<string>>()
  const idsOf = (file: string) => {
    let ids = idsCache.get(file)
    if (!ids) {
      ids = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]!))
      idsCache.set(file, ids)
    }
    return ids
  }

  for (const name of ['sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'og.png']) {
    if (!existsSync(join(root, name))) problems.push(`build output is missing ${name}`)
  }

  for (const file of htmlFiles(root)) {
    const here = '/' + file.slice(root.length).replace(/^[\\/]/, '').replace(/(^|\/)index\.html$/, '')
    const html = readFileSync(file, 'utf8')
    if (here !== '/404.html') {
      const h1s = (html.match(/<h1[\s>]/g) ?? []).length
      if (h1s !== 1) problems.push(`${here}: expected exactly one <h1>, found ${h1s}`)
      if (!html.includes('<title')) problems.push(`${here}: missing <title>`)
      if (!html.includes('<meta name="description"')) problems.push(`${here}: missing <meta name="description"`)
      if (!html.includes('<link rel="canonical"')) problems.push(`${here}: missing <link rel="canonical"`)
    }
    for (const [, raw] of html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)) {
      const href = raw!.replaceAll('&amp;', '&')
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue
      const [target, hash] = href.split('#') as [string, string | undefined]
      const route = target ? posix.resolve(here.endsWith('/') ? here : here + '/', target) : here
      const page = existsSync(fileOf(root, route)) ? fileOf(root, route) : undefined
      if (!page || !statSync(page).isFile()) problems.push(`${here}: link to ${href} has no target page`)
      else if (hash && page.endsWith('.html') && !idsOf(page).has(decodeURIComponent(hash))) problems.push(`${here}: link to ${href} has no such anchor`)
    }
  }
  return problems
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('../build/client/', import.meta.url))
  if (!existsSync(root)) {
    console.error('build/client does not exist; run `pnpm build` first')
    process.exit(1)
  }
  const problems = checkSite(root, allPaths())
  if (!existsSync(join(root, '404.html'))) problems.push('build output is missing 404.html')
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`links ok: ${allPaths().length} routes`)
}
