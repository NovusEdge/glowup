import { expect } from 'claude-code/testing'
import { fakeHost, test } from './kit.ts'

test('fakeHost lists a folder that only holds folders, and stats files', async () => {
  const { host } = fakeHost({ files: { '/r/a/owner': 's1', '/r/b/open': '' }, mtimes: { '/r/a/owner': 5 } })
  expect((await host.listDir('/r')).sort()).toEqual(['a', 'b'])
  expect(await host.stat('/r/a/owner')).toEqual({ mtimeMs: 5 })
  expect(await host.stat('/r/missing')).toBeUndefined()
})
