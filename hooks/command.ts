import type { Host } from './host.ts'
import { resolveTheme, PRESETS } from './themes.ts'
import { loadUserThemes, addTheme } from './userthemes.ts'
import { takeOver, restore } from './statusline.ts'

export const USAGE = [
  'glowup',
  '  /glowup theme <name>       switch theme',
  '  /glowup theme list         list installed themes',
  '  /glowup theme add <url>    install a theme file from an https URL',
  '  /glowup pane               open or close the glowup pane',
  '  /glowup motion reduced|full',
  '  /glowup statusline on|restore',
].join('\n')

export type Ctl = {
  // the theme in use, which may come from userConfig rather than the store
  current(): string
  setTheme(name: string): Promise<void>
  togglePane(): Promise<string>
  setMotion(reduced: boolean): void
  confirm(question: string): Promise<boolean>
}

export async function runCommand(host: Host, args: string, ctl: Ctl): Promise<string> {
  const [sub, a1, a2] = args.trim().split(/\s+/)
  if (sub === 'theme' && a1 === 'list') {
    const names = [...new Set([...Object.keys(PRESETS), ...Object.keys(await loadUserThemes(host))])]
    const current = ctl.current()
    return names.map(n => `${n === current ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'theme' && a1 === 'add' && a2) return addTheme(host, a2)
  if (sub === 'theme' && a1 === 'add') return USAGE
  if (sub === 'theme' && a1) {
    const r = resolveTheme(a1, await loadUserThemes(host))
    if (r.error) return r.error
    await host.storeSet('theme', a1)
    await ctl.setTheme(a1)
    return `Theme: ${a1}`
  }
  if (sub === 'pane') return ctl.togglePane()
  if (sub === 'motion' && (a1 === 'reduced' || a1 === 'full')) {
    await host.storeSet('reducedMotion', a1 === 'reduced')
    ctl.setMotion(a1 === 'reduced')
    return `Motion: ${a1}.`
  }
  if (sub === 'statusline' && a1 === 'on') return takeOver(host, q => ctl.confirm(q))
  if (sub === 'statusline' && a1 === 'restore') return restore(host)
  return sub ? `Unknown: ${args.trim()}\n\n${USAGE}` : USAGE
}
