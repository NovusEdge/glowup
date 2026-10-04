import { readFileSync, writeFileSync } from 'node:fs'
import { SITE, SUMMARY } from '../app/lib/seo.ts'
import { CONTENT_DIR, guides, type Guide } from '../pages.ts'

const body = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n+/, '').replaceAll('](assets/', '](/media/')

export function crawlFiles(list: Guide[], readGuide: (slug: string) => string): Record<string, string> {
  const out: Record<string, string> = {}
  const urls = ['/', ...list.map(g => `/${g.slug}/`)]
  out['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`
  out['robots.txt'] = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
  out['llms.txt'] = `# glowup\n\n> ${SUMMARY}\n\n## Guides\n\n${list.map(g => `- [${g.title}](${SITE}/${g.slug}.md): ${g.description}`).join('\n')}\n`
  out['llms-full.txt'] = list.map(g => `# ${g.title}\nURL: ${SITE}/${g.slug}/\n\n${body(readGuide(g.slug))}`).join('\n\n')
  for (const g of list) out[`${g.slug}.md`] = `# ${g.title}\n\n${body(readGuide(g.slug))}`
  return out
}

if (import.meta.main) {
  const files = crawlFiles(guides(), s => readFileSync(new URL(`${s}.md`, CONTENT_DIR), 'utf8'))
  for (const [name, text] of Object.entries(files)) writeFileSync(new URL(`../build/client/${name}`, import.meta.url), text)
  console.log(`crawl files: ${Object.keys(files).length}`)
}
