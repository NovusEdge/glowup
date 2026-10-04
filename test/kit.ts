import { mock, test as baseTest, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Host } from '../hooks/host.ts'

// Booting the engine takes 1 to 4 s on an idle machine and more under load, so the
// stock 5 s limit failed a different test on each busy CI run.
export const test = ((name: string, ...rest: unknown[]) => {
  const [opts, body] = rest.length === 1 ? [{}, rest[0]] : [rest[0], rest[1]]
  ;(baseTest as (...a: unknown[]) => void)(name, { timeoutMs: 20000, ...(opts as object) }, body)
}) as unknown as typeof baseTest

export const runGlowup = ($: Engine, args = '', columns = 120, isFullscreen = false) =>
  $.command.run({ command: 'glowup', args, origin: { kind: 'composer' }, presentation: { isFullscreen, columns } })

// An in-memory Host: files is a path -> text map, runs answers argv strings.
export function fakeHost(opts: { files?: Record<string, string>; runs?: Record<string, { exitCode: number; stdout: string }>; fetches?: Record<string, string>; projectStatusLine?: boolean } = {}) {
  const files = { ...(opts.files ?? {}) }
  const store: Record<string, unknown> = {}
  const ran: string[] = []
  const envs: (Record<string, string> | undefined)[] = []
  const host: Host = {
    run: async (argv, env) => {
      ran.push(argv.join(' '))
      envs.push(env)
      const hit = opts.runs?.[argv.join(' ')]
      if (!hit) return { exitCode: 127, stdout: '', stderr: 'not found' }
      return { ...hit, stderr: '' }
    },
    readFile: async p => { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]! },
    writeFile: async (p, t) => { files[p] = t },
    exists: async p => p in files || Object.keys(files).some(f => f.startsWith(p + '/')),
    listDir: async p => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1)).filter(n => !n.includes('/')),
    listFiles: async p => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => ({ name: f.slice(p.length + 1), size: files[f]!.length })).filter(e => !e.name.includes('/')),
    fetchText: async url => url in (opts.fetches ?? {}) ? { ok: true, status: 200, text: opts.fetches![url]! } : { ok: false, status: 404, text: '' },
    storeGet: async k => store[k],
    storeSet: async (k, v) => { store[k] = v },
    storeDelete: async k => { delete store[k] },
    projectStatusLine: async () => opts.projectStatusLine === true,
    configDir: '/home/u/.claude',
    dataHome: '/home/u/.local/share',
    home: '/home/u',
  }
  return { host, files, store, ran, envs }
}

// Answers $.env, $.fs and $.process from memory, so a wiring test can never reach
// the real config directory. Call it first in any test that loads the mod's hooks.
export function fakeFs(on: On, files: Record<string, string> = {}, ran?: (argv: string[]) => { exitCode: number; stdout: string } | void, env: Record<string, string> = {}) {
  mock.env(on, { HOME: '/fake', CLAUDE_CONFIG_DIR: '/fake/.claude', ...env })
  const writes: string[] = []
  const under = (p: string) => Object.keys(files).filter(f => f.startsWith(p + '/'))
  on('fs.exists', async (_$, e) => ({ value: e.path in files || under(e.path).length > 0 }) as never)
  on('fs.read', async (_$, e) => { if (!(e.path in files)) throw new Error('ENOENT ' + e.path); return { value: files[e.path]! } as never })
  on('fs.write', async (_$, e) => { writes.push(e.path); files[e.path] = e.text; return { value: undefined } as never })
  on('fs.list', async (_$, e) => ({ value: under(e.path).map(f => f.slice(e.path.length + 1)).filter(n => !n.includes('/')).map(name => ({ name, kind: 'file', size: files[`${e.path}/${name}`]!.length })) }) as never)
  on('settings.read', async () => ({ value: {} }) as never)
  on('process.run', async (_$, e) => ({ value: { exitCode: 1, stdout: '', stderr: '', ...ran?.((e as { argv: string[] }).argv) } }) as never)
  return { files, writes }
}
