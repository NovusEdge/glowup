import type { Host } from './host.ts'

export type Platform = 'linux' | 'darwin'
export const TERM_KEYS = ['TMUX', 'KONSOLE_VERSION', 'KITTY_WINDOW_ID', 'GHOSTTY_RESOURCES_DIR', 'WEZTERM_PANE', 'GNOME_TERMINAL_SCREEN', 'TERM_PROGRAM', 'TERMINAL', 'DISPLAY', 'WAYLAND_DISPLAY'] as const
export type TermEnv = Partial<Record<(typeof TERM_KEYS)[number], string>>
export const RELEASES = 'https://github.com/NovusEdge/glowup/releases'

const SAFE = /^[A-Za-z0-9@%+=:,./_-]+$/
export const shellLine = (argv: string[]) => argv.map(a => (SAFE.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ')
const appleString = (s: string) => s.replace(/[\\"]/g, '\\$&')

const BY_NAME: Record<string, (cmd: string[]) => string[]> = {
  konsole: c => ['-e', ...c],
  kitty: c => c,
  ghostty: c => ['-e', ...c],
  wezterm: c => ['start', '--', ...c],
  'gnome-terminal': c => ['--', ...c],
  foot: c => c,
  alacritty: c => ['-e', ...c],
}
// -e is xterm's convention, which st, urxvt and most other terminals accept
const named = (bin: string, label: string, cmd: string[]) => ({ name: label, argv: [bin, ...(BY_NAME[bin.split('/').pop()!] ?? ((c: string[]) => ['-e', ...c]))(cmd)] })

export const platformOf = (unameS: string): Platform | undefined => ({ Linux: 'linux', Darwin: 'darwin' } as const)[unameS.trim() as 'Linux' | 'Darwin']

export function pickTerminal(env: TermEnv, platform: Platform, has: { xdgTerminalExec: boolean; xTerminalEmulator: boolean }, cmd: string[]): { name: string; argv: string[] } | undefined {
  if (env.TMUX) return { name: 'tmux', argv: ['tmux', 'new-window', ...cmd] }
  if (platform === 'darwin') {
    const line = appleString(shellLine(cmd))
    if (env.TERM_PROGRAM === 'ghostty') return { name: 'Ghostty', argv: ['open', '-na', 'Ghostty', '--args', '-e', ...cmd] }
    if (env.TERM_PROGRAM === 'iTerm.app') return { name: 'iTerm', argv: ['osascript', '-e', `tell application "iTerm" to create window with default profile command "${line}"`] }
    // Terminal.app ships with every Mac, so it is the answer for any terminal we do not drive
    return { name: 'Terminal', argv: ['osascript', '-e', `tell application "Terminal" to do script "${line}"`] }
  }
  // over SSH there is no window to open
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return undefined
  if (env.TERMINAL) return named(env.TERMINAL, env.TERMINAL.split('/').pop()!, cmd)
  if (env.KONSOLE_VERSION) return named('konsole', 'Konsole', cmd)
  if (env.KITTY_WINDOW_ID) return named('kitty', 'kitty', cmd)
  if (env.GHOSTTY_RESOURCES_DIR) return named('ghostty', 'Ghostty', cmd)
  if (env.WEZTERM_PANE) return named('wezterm', 'WezTerm', cmd)
  if (env.GNOME_TERMINAL_SCREEN) return named('gnome-terminal', 'GNOME Terminal', cmd)
  if (has.xdgTerminalExec) return { name: 'xdg-terminal-exec', argv: ['xdg-terminal-exec', ...cmd] }
  if (has.xTerminalEmulator) return { name: 'your default terminal', argv: ['x-terminal-emulator', '-e', ...cmd] }
  return undefined
}

// process.run reads the child's output until it exits and kills it at 30 s: the terminal
// must hold none of the pipes and must leave the session's process group.
export const detached = (argv: string[], platform: Platform): string[] =>
  platform === 'linux' ? ['sh', '-c', 'setsid -f "$@" </dev/null >/dev/null 2>&1', 'sh', ...argv] : argv

export function releaseTarget(unameS: string, unameM: string): { os: string; arch: string } | undefined {
  const os = platformOf(unameS)
  const arch = ({ x86_64: 'amd64', amd64: 'amd64', aarch64: 'arm64', arm64: 'arm64' } as Record<string, string>)[unameM.trim()]
  return os && arch ? { os, arch } : undefined
}

export const assetName = (version: string, t: { os: string; arch: string }) => `glowup-installer_v${version}_${t.os}_${t.arch}.tar.gz`

// the same match install.sh makes: the asset's own line, with or without the binary-mode star
const CHECK = 'cd "$1" && awk -v f="$2" \'$2 == f || $2 == "*" f { print $1 "  " f }\' checksums.txt > want.txt && test -s want.txt && { sha256sum -c want.txt || shasum -a 256 -c want.txt; } >/dev/null 2>&1'

export async function ensureBinary(host: Host, o: { glowupBin?: string; pluginRoot: string; version: string; target?: { os: string; arch: string } }, id = Math.random().toString(36).slice(2, 8)): Promise<{ path: string } | { error: string }> {
  for (const p of [o.glowupBin, `${o.pluginRoot}/installer/glowup-installer`]) if (p && (await host.exists(p))) return { path: p }
  const dir = `${host.dataHome}/glowup/bin/${o.version}`, path = `${dir}/glowup-installer`
  if (await host.exists(path)) return { path }
  if (o.version === 'dev') return { error: 'A dev checkout has no release to download. Build one with just installer-build, or set GLOWUP_BIN.' }
  if (!o.target) return { error: 'There is no glowup-installer build for this system.' }
  const asset = assetName(o.version, o.target), url = `${RELEASES}/download/v${o.version}`
  // a part folder of its own, so two sessions downloading at once never share half a file
  const tmp = `${dir}.part-${id}`
  const step = async (argv: string[], what: string) => {
    const r = await host.run(argv, undefined, 120_000)
    if (r.exitCode !== 0) throw new Error(`${what}: ${r.stderr.trim().split('\n').pop() || `exit ${r.exitCode}`}`)
  }
  try {
    await step(['mkdir', '-p', tmp], 'could not make a folder')
    await step(['curl', '-fsSL', '-o', `${tmp}/${asset}`, `${url}/${asset}`], `could not download ${asset}`)
    await step(['curl', '-fsSL', '-o', `${tmp}/checksums.txt`, `${url}/checksums.txt`], 'could not download checksums.txt')
    await step(['sh', '-c', CHECK, 'sh', tmp, asset], `checksum mismatch for ${asset}`)
    await step(['tar', '-xzf', `${tmp}/${asset}`, '-C', tmp, 'glowup-installer'], `could not unpack ${asset}`)
    await step(['mkdir', '-p', dir], 'could not make a folder')
    await step(['mv', `${tmp}/glowup-installer`, path], 'could not move the binary into place')
    return { path }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    await host.run(['rm', '-rf', tmp]).catch(() => {})
  }
}
