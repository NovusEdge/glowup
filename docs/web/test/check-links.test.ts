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

test('checkSite reports missing pages and anchors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-'))
  put(dir, 'index.html', '<a href="/a#x">a</a><a href="/b">b</a>')
  put(dir, 'a/index.html', '<h2 id="x">x</h2>')
  put(dir, 'api/search', '{}')
  assert.deepEqual(checkSite(dir, ['/', '/a']), ['/: link to /b has no target page'])

  put(dir, 'b/index.html', '<p>b</p>')
  assert.deepEqual(checkSite(dir, ['/', '/a']), [])

  put(dir, 'index.html', '<a href="/a#y">a</a>')
  assert.match(checkSite(dir, ['/', '/a'])[0]!, /no such anchor/)
})

test('checkSite requires api/search to be JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-'))
  put(dir, 'index.html', '<p>home</p>')
  put(dir, 'api/search', 'nope')
  assert.deepEqual(checkSite(dir, ['/']), ['api/search is not JSON'])
})
