import type { EngineInterface, Register } from 'claude-code'
import type { Host } from './host.ts'
import { runCommand, type Ctl } from './command.ts'

type Engine = EngineInterface

let configDir = ''

function hostOf($: Engine): Host {
  return {
    run: async argv => { const r = await $.process.run(argv); return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr } },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    listDir: async path => (await $.fs.list(path)).map(e => e.name),
    fetchText: async url => { const r = await $.http.fetch(url); return { ok: r.ok, status: r.status, text: r.text } },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    projectStatusLine: async () =>
      (await $.settings.read({ source: 'project' })).statusLine !== undefined ||
      (await $.settings.read({ source: 'local' })).statusLine !== undefined,
    configDir,
  }
}

function ctlOf($: Engine): Ctl {
  return {
    setTheme: async () => {},
    togglePane: async () => 'The glowup pane is not built yet.',
    setMotion: () => {},
    // ask rejects when the person dismisses the dialog; that counts as No
    confirm: async question => (await $.ui.ask(question, ['Yes', 'No']).catch(() => 'No')) === 'Yes',
  }
}

export const register: Register = (on, _options) => {
  on('session.start', async ($, e, next) => {
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? ''}/.claude`
    await $.command.register({ name: 'glowup', description: 'Themes, the glowup pane and status line', argumentHint: 'theme|pane|motion|statusline ...' })
    return next(e)
  })
  on('command.run', { command: 'glowup' }, async ($, e) => ({ text: await runCommand(hostOf($), e.args, ctlOf($)) }))
}
