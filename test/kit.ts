import type { Engine } from 'claude-code/testing'
import type { Host } from '../hooks/host.ts'

export const runGlowup = ($: Engine, args = '', columns = 120, isFullscreen = false) =>
  $.command.run({ command: 'glowup', args, origin: { kind: 'composer' }, presentation: { isFullscreen, columns } })

// An in-memory Host: files is a path -> text map, runs answers argv strings.
export function fakeHost(opts: { files?: Record<string, string>; runs?: Record<string, { exitCode: number; stdout: string }>; fetches?: Record<string, string>; projectStatusLine?: boolean } = {}) {
  const files = { ...(opts.files ?? {}) }
  const store: Record<string, unknown> = {}
  const host: Host = {
    run: async argv => {
      const hit = opts.runs?.[argv.join(' ')]
      if (!hit) return { exitCode: 127, stdout: '', stderr: 'not found' }
      return { ...hit, stderr: '' }
    },
    readFile: async p => { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]! },
    writeFile: async (p, t) => { files[p] = t },
    exists: async p => p in files || Object.keys(files).some(f => f.startsWith(p + '/')),
    listDir: async p => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1)).filter(n => !n.includes('/')),
    fetchText: async url => url in (opts.fetches ?? {}) ? { ok: true, status: 200, text: opts.fetches![url]! } : { ok: false, status: 404, text: '' },
    storeGet: async k => store[k],
    storeSet: async (k, v) => { store[k] = v },
    storeDelete: async k => { delete store[k] },
    projectStatusLine: async () => opts.projectStatusLine === true,
    configDir: '/home/u/.claude',
  }
  return { host, files, store }
}
