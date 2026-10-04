import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSite } from '../scripts/check-links.ts'

const put = (root: string, file: string, body: string) => {
  const p = join(root, file)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, body)
}

const head = '<title>t</title><meta name="description" content="d"><link rel="canonical" href="https://x/a/">'
const page = (body = '', h1 = '<h1>t</h1>') => head + h1 + body
const site = (dir: string) => {
  for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'og.png']) put(dir, f, 'x')
}

test('checkSite reports missing pages and anchors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-'))
  site(dir)
  put(dir, 'index.html', page('<a href="/a#x">a</a><a href="/b">b</a>'))
  put(dir, 'a/index.html', page('<h2 id="x">x</h2>'))
  put(dir, 'api/search', '{}')
  assert.deepEqual(checkSite(dir, ['/', '/a']), ['/: link to /b has no target page'])

  put(dir, 'b/index.html', page('<p>b</p>'))
  assert.deepEqual(checkSite(dir, ['/', '/a']), [])

  put(dir, 'index.html', page('<a href="/a#y">a</a>'))
  assert.match(checkSite(dir, ['/', '/a'])[0]!, /no such anchor/)
})

test('checkSite requires api/search to be JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-'))
  site(dir)
  put(dir, 'index.html', page('<p>home</p>'))
  put(dir, 'api/search', 'nope')
  assert.deepEqual(checkSite(dir, ['/']), ['api/search is not JSON'])
})

test('checkSite reports SEO gaps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-'))
  put(dir, 'api/search', '{}')
  put(dir, 'index.html', page())
  put(dir, 'a/index.html', page('', '<h1>a</h1><h1>b</h1>'))
  put(dir, 'b/index.html', page().replace(/<link[^>]*>/, ''))
  put(dir, '404.html', '<p>nope</p>')
  const problems = checkSite(dir, ['/', '/a', '/b'])
  assert.ok(problems.includes('/a: expected exactly one <h1>, found 2'))
  assert.ok(problems.includes('/b: missing <link rel="canonical"'))
  assert.ok(problems.includes('build output is missing sitemap.xml'))
  assert.ok(problems.includes('build output is missing og.png'))
  assert.equal(problems.filter(p => p.startsWith('/:') || p.startsWith('/404')).length, 0)
})
