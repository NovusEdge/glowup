import type { Host } from './host.ts'
import { resolveTheme, PRESETS } from './themes.ts'
import { loadUserThemes, addTheme } from './userthemes.ts'
import { takeOver, restore } from './statusline.ts'
import { resolveLook, exportMix, type Mix } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { loadUserPacks, addPack, savePack, SAFE_NAME } from './userpacks.ts'
import { parseScheme } from './schemes.ts'
import type { PetSetting } from './pets.ts'
import type { BubbleSetting } from './bubbles.ts'
import type { EggStore } from './eggs.ts'

export const USAGE = [
  'glowup',
  '  /glowup theme <name>       switch theme',
  '  /glowup theme list         list installed themes',
  '  /glowup theme add <url>    install a theme file from an https URL',
  '  /glowup pack <name|url>    apply a pack (--force replaces an installed one)',
  '  /glowup pack list          list packs',
  '  /glowup pack save <name>   save the current look as a pack file',
  '  /glowup config             change the look in a dialog',
  '  /glowup import <file>      turn a terminal color scheme into a pack',
  '  /glowup pet clawd|off      choose the pet, or none',
  '  /glowup bubbles on|off     speech bubbles',
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
  mix(): Mix
  // applies the mix; returns what failed to resolve
  setMix(mix: Mix): Promise<string[]>
  pet(): PetSetting
  setPet(p: PetSetting): void
  setBubbles(b: BubbleSetting): void
  openConfig(): Promise<string>
}

const MAX_SCHEME_BYTES = 65536

async function applyMix(host: Host, ctl: Ctl, mix: Mix) {
  await host.storeSet('mix', mix)
  await ctl.setMix(mix)
}

const shinyUnlocked = async (host: Host) => ((await host.storeGet('eggs')) as EggStore | undefined)?.shinyAt !== undefined

async function packList(host: Host, ctl: Ctl): Promise<string> {
  const user = await loadUserPacks(host)
  const names = [...new Set([...Object.keys(PACKS), ...Object.keys(user).filter(n => SAFE_NAME.test(n))])]
  const m = ctl.mix()
  // a layer that failed to resolve fell back to classic, so the pack is not what is showing
  const { look } = resolveLook(m, user, await loadUserThemes(host))
  const whole = m.colors === m.motion && m.theme === undefined && m.spinner === undefined && look.colorsFrom === m.colors && look.motionFrom === m.motion
  const lines = names.map(n => `${whole && n === m.colors ? '●' : '○'} ${n}`)
  if (!whole) lines.push(`custom mix: colors ${m.colors}, motion ${m.motion}${m.theme ? `, theme ${m.theme}` : ''}${m.spinner ? `, spinner ${m.spinner}` : ''}`)
  return lines.join('\n')
}

async function usePack(host: Host, ctl: Ctl, name: string): Promise<string> {
  const mix: Mix = { colors: name, motion: name }
  const { errors } = resolveLook(mix, await loadUserPacks(host), await loadUserThemes(host))
  if (errors.length) return errors.join('\n')
  await applyMix(host, ctl, mix)
  return `Pack: ${name}`
}

async function importScheme(host: Host, ctl: Ctl, rawPath: string, force: boolean): Promise<string> {
  const path = rawPath.startsWith('~/') ? `${host.home}${rawPath.slice(1)}` : rawPath
  // head is portable and bounded, so a FIFO or device cannot hang or flood the read.
  const head = await host.run(['head', '-c', String(MAX_SCHEME_BYTES + 1), path]).catch(() => undefined)
  if (!head || head.exitCode !== 0) return `Could not read ${path}.`
  if (new TextEncoder().encode(head.stdout).length > MAX_SCHEME_BYTES) return `${path} is over 64 KB.`
  const text = head.stdout
  let scheme: ReturnType<typeof parseScheme>
  try { scheme = parseScheme(text, path) } catch (err) { return err instanceof Error ? err.message : String(err) }
  const msg = await savePack(host, {
    format: 1, name: scheme.name, description: `imported from ${path.split('/').pop()}`,
    colors: { palette: scheme.palette, bg: scheme.bg },
  }, force)
  if (!msg.startsWith('Saved')) return msg
  await applyMix(host, ctl, { ...ctl.mix(), colors: scheme.name, theme: undefined })
  return msg
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
    await applyMix(host, ctl, { ...ctl.mix(), theme: a1 })
    return `Theme: ${a1}`
  }
  if (sub === 'pack' && a1 === 'list') return packList(host, ctl)
  if (sub === 'pack' && a1 === 'save') {
    if (!a2) return USAGE
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    return savePack(host, exportMix(look, a2))
  }
  if (sub === 'pack' && a1?.startsWith('https://')) {
    const r = await addPack(host, a1, a2 === '--force')
    if (!r.name) return r.message
    await applyMix(host, ctl, { colors: r.name, motion: r.name })
    return `Pack: ${r.name}`
  }
  if (sub === 'pack' && a1) return usePack(host, ctl, a1)
  if (sub === 'import' && a1) return importScheme(host, ctl, a1, a2 === '--force')
  if (sub === 'pet' && a1 === 'list') {
    const cur = ctl.pet()
    return ['clawd', ...(await shinyUnlocked(host) ? ['clawd-shiny'] : []), 'off'].map(n => `${n === cur ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'pet' && (a1 === 'clawd' || a1 === 'off' || a1 === 'clawd-shiny')) {
    if (a1 === 'clawd-shiny' && !(await shinyUnlocked(host))) return 'The shiny pet is not unlocked yet.'
    await host.storeSet('pet', a1)
    ctl.setPet(a1)
    return `Pet: ${a1}`
  }
  if (sub === 'bubbles' && (a1 === 'on' || a1 === 'off')) {
    await host.storeSet('bubbles', a1)
    ctl.setBubbles(a1)
    return `Bubbles: ${a1}`
  }
  if (sub === 'pane') return ctl.togglePane()
  if (sub === 'config') return ctl.openConfig()
  if (sub === 'motion' && (a1 === 'reduced' || a1 === 'full')) {
    await host.storeSet('reducedMotion', a1 === 'reduced')
    ctl.setMotion(a1 === 'reduced')
    return `Motion: ${a1}.`
  }
  if (sub === 'statusline' && a1 === 'on') return takeOver(host, q => ctl.confirm(q))
  if (sub === 'statusline' && a1 === 'restore') return restore(host)
  return sub ? `Unknown: ${args.trim()}\n\n${USAGE}` : USAGE
}
