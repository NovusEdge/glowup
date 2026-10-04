import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageMeta, softwareJsonLd, SITE } from '../app/lib/seo.ts'

test('pageMeta has title, description, canonical and social tags', () => {
  const m = pageMeta({ title: 'Packs · glowup', description: 'd', path: '/packs/' })
  const get = (k: string, v: string) => m.find(x => x[k] === v)
  assert.equal(m.find(x => 'title' in x)!.title, 'Packs · glowup')
  assert.equal(get('name', 'description')!.content, 'd')
  assert.equal(get('rel', 'canonical')!.href, `${SITE}/packs/`)
  assert.equal(get('property', 'og:image')!.content, `${SITE}/og.png`)
  assert.equal(get('name', 'twitter:card')!.content, 'summary_large_image')
})

test('JSON-LD names the app and its category', () => {
  const j = softwareJsonLd() as any
  assert.equal(j['@type'], 'SoftwareApplication')
  assert.equal(j.applicationCategory, 'DeveloperApplication')
})
