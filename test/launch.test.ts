import { expect } from 'claude-code/testing'
import { fakeHost, test } from './kit.ts'
import { assetName, detached, ensureBinary, pickTerminal, platformOf, releaseTarget, shellLine } from '../hooks/launch.ts'

const CMD = ['/b/glowup-installer', 'config', '--run', '/c/glowup/remote/r1']
const X = { DISPLAY: ':0' }
const NONE = { xdgTerminalExec: false, xTerminalEmulator: false }
const ALL = { xdgTerminalExec: true, xTerminalEmulator: true }

test('each terminal is picked by its own variable', () => {
  expect(pickTerminal({ TMUX: '/tmp/t,1,0' }, 'linux', NONE, CMD)).toEqual({ name: 'tmux', argv: ['tmux', 'new-window', ...CMD] })
  expect(pickTerminal({ ...X, KONSOLE_VERSION: '260801' }, 'linux', NONE, CMD)).toEqual({ name: 'Konsole', argv: ['konsole', '-e', ...CMD] })
  expect(pickTerminal({ ...X, KITTY_WINDOW_ID: '1' }, 'linux', NONE, CMD)?.argv).toEqual(['kitty', ...CMD])
  expect(pickTerminal({ ...X, GHOSTTY_RESOURCES_DIR: '/g' }, 'linux', NONE, CMD)?.argv).toEqual(['ghostty', '-e', ...CMD])
  expect(pickTerminal({ ...X, WEZTERM_PANE: '0' }, 'linux', NONE, CMD)?.argv).toEqual(['wezterm', 'start', '--', ...CMD])
  expect(pickTerminal({ ...X, GNOME_TERMINAL_SCREEN: '/x' }, 'linux', NONE, CMD)?.argv).toEqual(['gnome-terminal', '--', ...CMD])
})

test('both desktop-default lookups share one label', () => {
  expect(pickTerminal(X, 'linux', { xdgTerminalExec: true, xTerminalEmulator: false }, CMD)?.name).toBe('your default terminal')
  expect(pickTerminal(X, 'linux', { xdgTerminalExec: false, xTerminalEmulator: true }, CMD)?.name).toBe('your default terminal')
})

test('$TERMINAL is the explicit choice: known terminals use their convention, others get -e', () => {
  expect(pickTerminal({ ...X, TERMINAL: '/usr/bin/foot' }, 'linux', NONE, CMD)).toEqual({ name: 'foot', argv: ['/usr/bin/foot', ...CMD] })
  expect(pickTerminal({ ...X, TERMINAL: 'alacritty' }, 'linux', NONE, CMD)?.argv).toEqual(['alacritty', '-e', ...CMD])
  expect(pickTerminal({ ...X, TERMINAL: 'st' }, 'linux', NONE, CMD)).toEqual({ name: 'st', argv: ['st', '-e', ...CMD] })
  expect(pickTerminal({ ...X, KONSOLE_VERSION: '1', TERMINAL: 'alacritty' }, 'linux', NONE, CMD)?.argv).toEqual(['alacritty', '-e', ...CMD])
})

test('terminals whose -e takes one string get -x', () => {
  for (const t of ['xfce4-terminal', 'mate-terminal', 'terminator']) expect(pickTerminal({ ...X, TERMINAL: `/usr/bin/${t}` }, 'linux', NONE, CMD)).toEqual({ name: t, argv: [`/usr/bin/${t}`, '-x', ...CMD] })
})

test('a $TERMINAL named like an Object.prototype member takes the -e fallback', () => {
  for (const t of ['toString', 'constructor', 'valueOf', '__proto__']) expect(pickTerminal({ ...X, TERMINAL: t }, 'linux', NONE, CMD)?.argv).toEqual([t, '-e', ...CMD])
})

test('an unrecognised terminal falls back to the desktop default', () => {
  expect(pickTerminal(X, 'linux', { xdgTerminalExec: true, xTerminalEmulator: false }, CMD)?.argv).toEqual(['xdg-terminal-exec', ...CMD])
  expect(pickTerminal(X, 'linux', { xdgTerminalExec: false, xTerminalEmulator: true }, CMD)).toEqual({ name: 'your default terminal', argv: ['x-terminal-emulator', '-e', ...CMD] })
  expect(pickTerminal(X, 'linux', ALL, CMD)?.argv).toEqual(['xdg-terminal-exec', ...CMD])
  expect(pickTerminal(X, 'linux', NONE, CMD)).toBeUndefined()
})

test('outside tmux a Linux terminal needs a display', () => {
  expect(pickTerminal({ KONSOLE_VERSION: '1', TERMINAL: 'st' }, 'linux', ALL, CMD)).toBeUndefined()
  expect(pickTerminal({ KONSOLE_VERSION: '1', WAYLAND_DISPLAY: 'wayland-0' }, 'linux', ALL, CMD)?.name).toBe('Konsole')
  expect(pickTerminal({ TMUX: '/t' }, 'linux', ALL, CMD)?.name).toBe('tmux')
})

test('macOS opens Ghostty, Terminal and iTerm through their apps, and any other terminal as Terminal', () => {
  expect(pickTerminal({ TERM_PROGRAM: 'ghostty' }, 'darwin', NONE, CMD)?.argv).toEqual(['open', '-na', 'Ghostty', '--args', '-e', ...CMD])
  const t = pickTerminal({ TERM_PROGRAM: 'Apple_Terminal' }, 'darwin', NONE, CMD)!
  expect(t.name).toBe('Terminal')
  expect(t.argv.slice(0, 2)).toEqual(['osascript', '-e'])
  expect(t.argv[2]).toBe(`tell application "Terminal" to do script "${shellLine(CMD)}"`)
  expect(pickTerminal({ TERM_PROGRAM: 'iTerm.app' }, 'darwin', NONE, CMD)?.argv[2]).toBe(`tell application "iTerm" to create window with default profile command "${shellLine(CMD)}"`)
  expect(pickTerminal({ TERM_PROGRAM: 'vscode' }, 'darwin', NONE, CMD)).toEqual(t)
  expect(pickTerminal({}, 'darwin', NONE, CMD)).toEqual(t)
})

test('macOS opens kitty and WezTerm through their apps, after the TERM_PROGRAM matches', () => {
  expect(pickTerminal({ KITTY_WINDOW_ID: '1' }, 'darwin', NONE, CMD)).toEqual({ name: 'kitty', argv: ['open', '-na', 'kitty', '--args', ...CMD] })
  expect(pickTerminal({ WEZTERM_PANE: '0' }, 'darwin', NONE, CMD)).toEqual({ name: 'WezTerm', argv: ['open', '-na', 'WezTerm', '--args', 'start', '--', ...CMD] })
  expect(pickTerminal({ KITTY_WINDOW_ID: '1', TERM_PROGRAM: 'ghostty' }, 'darwin', NONE, CMD)?.name).toBe('Ghostty')
  expect(pickTerminal({ WEZTERM_PANE: '0', TERM_PROGRAM: 'iTerm.app' }, 'darwin', NONE, CMD)?.name).toBe('iTerm')
})

test('AppleScript strings escape backslash and quote around the shell quoting', () => {
  const cmd = ['/Users/a b/glowup-installer', 'config', '--run', '/c/he said "hi"\\x']
  const line = shellLine(cmd).replace(/[\\"]/g, '\\$&')
  expect(pickTerminal({}, 'darwin', NONE, cmd)?.argv[2]).toBe(`tell application "Terminal" to do script "${line}"`)
  expect(line).toBe(`'/Users/a b/glowup-installer' config --run '/c/he said \\"hi\\"\\\\x'`)
})

test('Linux launches go through setsid with the pipes closed; macOS runs as is', () => {
  expect(detached(['konsole', '-e', 'x'], 'linux')).toEqual(['sh', '-c', 'setsid -f "$@" </dev/null >/dev/null 2>&1', 'sh', 'konsole', '-e', 'x'])
  expect(detached(['open', '-na', 'Ghostty'], 'darwin')).toEqual(['open', '-na', 'Ghostty'])
})

test('shellLine quotes what needs it', () => {
  expect(shellLine(['/a b/x', 'config', "it's"])).toBe(`'/a b/x' config 'it'\\''s'`)
  expect(shellLine(['/b/glowup-installer', 'config', '--run', '/c/a.b-c_d/r1'])).toBe('/b/glowup-installer config --run /c/a.b-c_d/r1')
  expect(shellLine(['a', ''])).toBe("a ''")
  expect(shellLine(['$HOME', '`id`', '~/x', 'a;b', 'a&b', 'a|b', '*', '$(id)'])).toBe("'$HOME' '`id`' '~/x' 'a;b' 'a&b' 'a|b' '*' '$(id)'")
  expect(shellLine(['"q"', 'a\nb', '\\'])).toBe(`'"q"' 'a\nb' '\\'`)
  expect(shellLine(["''"])).toBe(`''\\'''\\'''`)
})

test('platform and release target follow install.sh', () => {
  expect(platformOf('Linux\n')).toBe('linux')
  expect(platformOf('Darwin')).toBe('darwin')
  expect(platformOf('MINGW64_NT')).toBeUndefined()
  expect(releaseTarget('Linux', 'x86_64')).toEqual({ os: 'linux', arch: 'amd64' })
  expect(releaseTarget('Darwin', 'arm64')).toEqual({ os: 'darwin', arch: 'arm64' })
  expect(releaseTarget('Linux', 'aarch64')).toEqual({ os: 'linux', arch: 'arm64' })
  expect(releaseTarget('Linux', 'riscv64')).toBeUndefined()
  expect(assetName('0.12.0', { os: 'linux', arch: 'amd64' })).toBe('glowup-installer_v0.12.0_linux_amd64.tar.gz')
})

test('ensureBinary prefers GLOWUP_BIN, then a dev build, then the cached download', async () => {
  const { host } = fakeHost({ files: { '/bin/gi': '', '/p/installer/glowup-installer': '', '/home/u/.local/share/glowup/bin/0.12.0/glowup-installer': '' } })
  expect(await ensureBinary(host, { glowupBin: '/bin/gi', pluginRoot: '/p', version: '0.12.0' })).toEqual({ path: '/bin/gi' })
  expect(await ensureBinary(host, { pluginRoot: '/p', version: '0.12.0' })).toEqual({ path: '/p/installer/glowup-installer' })
  expect(await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0' })).toEqual({ path: '/home/u/.local/share/glowup/bin/0.12.0/glowup-installer' })
})

test('ensureBinary downloads, checks and moves the release binary into place', async () => {
  const D = '/home/u/.local/share/glowup/bin/0.12.0', T = `${D}.part-x`, A = 'glowup-installer_v0.12.0_linux_amd64.tar.gz', U = 'https://github.com/NovusEdge/glowup/releases/download/v0.12.0'
  const ok = { exitCode: 0, stdout: '' }
  const { host, ran, timeouts } = fakeHost({ runs: {
    [`mkdir -p ${T}`]: ok, [`curl -fsSL -o ${T}/${A} ${U}/${A}`]: ok, [`curl -fsSL -o ${T}/checksums.txt ${U}/checksums.txt`]: ok,
    [`tar -xzf ${T}/${A} -C ${T} glowup-installer`]: ok, [`mkdir -p ${D}`]: ok, [`mv ${T}/glowup-installer ${D}/glowup-installer`]: ok, [`rm -rf ${T}`]: ok,
  } })
  const check = (argv: string) => argv.startsWith('sh -c cd "$1"')
  // the checksum step's argv carries a script; answer it by prefix
  const run = host.run
  host.run = async (argv, env, t) => check(argv.join(' ')) ? (ran.push(argv.join(' ')), timeouts.push(t), { exitCode: 0, stdout: '', stderr: '' }) : run(argv, env, t)
  expect(await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0', target: { os: 'linux', arch: 'amd64' } }, 'x')).toEqual({ path: `${D}/glowup-installer` })
  expect(ran.at(-1)).toBe(`rm -rf ${T}`)
  // the download steps outlast process.run's 30 s default; the cleanup does not need to
  expect(timeouts.slice(0, -1)).toEqual(Array(8).fill(120_000))
})

test('ensureBinary names a spawn failure or timeout like a failed exit', async () => {
  const T = '/home/u/.local/share/glowup/bin/0.12.0.part-x'
  const { host, ran } = fakeHost()
  host.run = async argv => { ran.push(argv.join(' ')); if (argv[0] === 'curl') throw new Error('spawn curl ENOENT'); return { exitCode: 0, stdout: '', stderr: '' } }
  const r = await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0', target: { os: 'linux', arch: 'amd64' } }, 'x')
  expect('error' in r && r.error).toBe('could not download glowup-installer_v0.12.0_linux_amd64.tar.gz: spawn curl ENOENT')
  expect(ran.at(-1)).toBe(`rm -rf ${T}`)
})

test('ensureBinary tells a missing checksums.txt entry from a mismatch', async () => {
  const A = 'glowup-installer_v0.12.0_linux_amd64.tar.gz'
  const target = { os: 'linux', arch: 'amd64' }
  const answer = (failing: 'FIND' | 'CHECK') => {
    const { host } = fakeHost()
    host.run = async argv => {
      const script = argv[0] === 'sh' ? argv[2]! : ''
      const hit = script.includes('awk') ? failing === 'FIND' : script.includes('sha256sum') && failing === 'CHECK'
      return { exitCode: hit ? 1 : 0, stdout: '', stderr: '' }
    }
    return ensureBinary(host, { pluginRoot: '/q', version: '0.12.0', target }, 'x')
  }
  expect(await answer('FIND')).toEqual({ error: `checksums.txt has no entry for ${A}: exit 1` })
  expect(await answer('CHECK')).toEqual({ error: `checksum mismatch for ${A}: exit 1` })
})

test('ensureBinary says why a download failed and removes the part folder', async () => {
  const D = '/home/u/.local/share/glowup/bin/0.12.0', T = `${D}.part-x`
  const { host, ran } = fakeHost({ runs: { [`mkdir -p ${T}`]: { exitCode: 0, stdout: '' }, [`rm -rf ${T}`]: { exitCode: 0, stdout: '' } } })
  const r = await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0', target: { os: 'linux', arch: 'amd64' } }, 'x')
  expect('error' in r && r.error).toMatch(/^could not download glowup-installer_v0\.12\.0_linux_amd64\.tar\.gz/)
  expect(ran.at(-1)).toBe(`rm -rf ${T}`)
})

test('a dev version or an unknown system has nothing to download', async () => {
  const { host } = fakeHost()
  expect(await ensureBinary(host, { pluginRoot: '/q', version: 'dev', target: { os: 'linux', arch: 'amd64' } })).toEqual({ error: 'A dev checkout has no release to download. Build one with just installer-build, or set GLOWUP_BIN.' })
  expect(await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0' })).toEqual({ error: 'There is no glowup-installer build for this system.' })
})
