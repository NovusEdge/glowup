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

test('$TERMINAL is the explicit choice: known terminals use their convention, others get -e', () => {
  expect(pickTerminal({ ...X, TERMINAL: '/usr/bin/foot' }, 'linux', NONE, CMD)).toEqual({ name: 'foot', argv: ['/usr/bin/foot', ...CMD] })
  expect(pickTerminal({ ...X, TERMINAL: 'alacritty' }, 'linux', NONE, CMD)?.argv).toEqual(['alacritty', '-e', ...CMD])
  expect(pickTerminal({ ...X, TERMINAL: 'st' }, 'linux', NONE, CMD)).toEqual({ name: 'st', argv: ['st', '-e', ...CMD] })
  expect(pickTerminal({ ...X, KONSOLE_VERSION: '1', TERMINAL: 'alacritty' }, 'linux', NONE, CMD)?.argv).toEqual(['alacritty', '-e', ...CMD])
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

test('Linux launches go through setsid with the pipes closed; macOS runs as is', () => {
  expect(detached(['konsole', '-e', 'x'], 'linux')).toEqual(['sh', '-c', 'setsid -f "$@" </dev/null >/dev/null 2>&1', 'sh', 'konsole', '-e', 'x'])
  expect(detached(['open', '-na', 'Ghostty'], 'darwin')).toEqual(['open', '-na', 'Ghostty'])
})

test('shellLine quotes what needs it', () => {
  expect(shellLine(['/a b/x', 'config', "it's"])).toBe(`'/a b/x' config 'it'\\''s'`)
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
  const { host, ran } = fakeHost({ runs: {
    [`mkdir -p ${T}`]: ok, [`curl -fsSL -o ${T}/${A} ${U}/${A}`]: ok, [`curl -fsSL -o ${T}/checksums.txt ${U}/checksums.txt`]: ok,
    [`tar -xzf ${T}/${A} -C ${T} glowup-installer`]: ok, [`mkdir -p ${D}`]: ok, [`mv ${T}/glowup-installer ${D}/glowup-installer`]: ok, [`rm -rf ${T}`]: ok,
  } })
  const check = (argv: string) => argv.startsWith('sh -c cd "$1"')
  // the checksum step's argv carries a script; answer it by prefix
  const run = host.run
  host.run = async (argv, env, t) => check(argv.join(' ')) ? (ran.push(argv.join(' ')), { exitCode: 0, stdout: '', stderr: '' }) : run(argv, env, t)
  expect(await ensureBinary(host, { pluginRoot: '/q', version: '0.12.0', target: { os: 'linux', arch: 'amd64' } }, 'x')).toEqual({ path: `${D}/glowup-installer` })
  expect(ran.at(-1)).toBe(`rm -rf ${T}`)
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
