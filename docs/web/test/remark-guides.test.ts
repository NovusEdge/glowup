import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { visit } from 'unist-util-visit'
import { remarkGuides } from '../app/lib/remark-guides.ts'

const urls = (md: string) => {
  const tree = fromMarkdown(md)
  remarkGuides()(tree)
  const out: string[] = []
  visit(tree, ['link', 'image'], (n: any) => { out.push(n.url) })
  return out
}

test('guide links become site paths, anchors kept', () => {
  assert.deepEqual(urls('[a](packs.md) [b](commands.md#config) [c](https://x.dev/a.md)'), ['/packs', '/commands#config', 'https://x.dev/a.md'])
})

test('asset images move to /media', () => {
  assert.deepEqual(urls('![band](assets/band.png)'), ['/media/band.png'])
})

test('nested or relative-up paths are left alone', () => {
  assert.deepEqual(urls('[x](../README.md) [y](web/x.md)'), ['../README.md', 'web/x.md'])
})
