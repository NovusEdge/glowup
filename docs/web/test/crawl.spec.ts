import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crawlFiles } from '../scripts/crawl.ts'

const guides = [
  { slug: 'install', title: 'Install', description: 'Get it running.' },
  { slug: 'foo', title: 'Foo', description: 'A guide added later.' },
]
const files = crawlFiles(guides, s => `---\ntitle: x\n---\n\n# body of ${s}\n`)

test('sitemap lists / and every guide with absolute URLs', () => {
  assert.match(files['sitemap.xml']!, /<loc>https:\/\/glowup\.khimani\.dev\/<\/loc>/)
  assert.match(files['sitemap.xml']!, /<loc>https:\/\/glowup\.khimani\.dev\/foo\/<\/loc>/)
})

test('robots allows all and links the sitemap', () => {
  assert.match(files['robots.txt']!, /User-agent: \*\nAllow: \//)
  assert.match(files['robots.txt']!, /Sitemap: https:\/\/glowup\.khimani\.dev\/sitemap\.xml/)
})

test('llms.txt links each guide to its raw markdown with the description', () => {
  assert.match(files['llms.txt']!, /^# glowup\n\n> A mod that makes Claude Code look nicer/)
  assert.match(files['llms.txt']!, /- \[Foo\]\(https:\/\/glowup\.khimani\.dev\/foo\.md\): A guide added later\./)
})

test('llms-full.txt and raw .md copies carry the bodies without frontmatter', () => {
  assert.match(files['llms-full.txt']!, /# Foo\nURL: https:\/\/glowup\.khimani\.dev\/foo\/\n\n# body of foo/)
  assert.equal(files['foo.md'], '# Foo\n\n# body of foo\n')
})

test('image links point at /media/ in raw markdown and llms-full.txt', () => {
  const f = crawlFiles(guides, () => '---\ntitle: x\n---\n\n![shot](assets/a.png)\n')
  assert.match(f['foo.md']!, /!\[shot\]\(\/media\/a\.png\)/)
  assert.match(f['llms-full.txt']!, /\(\/media\/a\.png\)/)
  assert.doesNotMatch(f['foo.md']!, /\]\(assets\//)
})
