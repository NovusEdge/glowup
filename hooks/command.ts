import type { Host } from './host.ts'
import { resolveTheme, PRESETS, COLOR_KEYS, ROLE_LABELS, shown } from './themes.ts'
import { loadUserThemes, addTheme } from './userthemes.ts'
import { takeOver, restore } from './statusline.ts'
import { resolveLook, exportMix, normalizeHex, cleanOverrides, SPINNER_IDS, type Mix } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { decodeLink, isStudioLink } from './link.ts'
import { loadUserPacks, addPack, savePack, installPackText, SAFE_NAME } from './userpacks.ts'
import { parseScheme } from './schemes.ts'
import { konsoleScheme } from './konsole.ts'
import type { PetSetting } from './pets.ts'
import type { BubbleSetting } from './bubbles.ts'
import type { EggStore } from './eggs.ts'
import { SHORT_TEXT, FULL_TEXT } from './help.ts'
import { FIELD_IDS, isFieldId, type FieldId } from './fields.ts'
import { parseSetup, setSetupField, describeSetup, DEFAULT_SETUP, type Setup } from './setup.ts'

// What a command that needs more input falls back to, and what a headless config run prints.
export const USAGE = FULL_TEXT

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
  bubbles(): BubbleSetting
  setBubbles(b: BubbleSetting): void
  reduced(): boolean
  // opens the config pane; returns what to print
  openConfig(): Promise<string>
  // a -p run: nobody is attached to any surface
  headless(): Promise<boolean>
  fields(): readonly FieldId[]
  // undefined goes back to the installer's (userConfig) list
  setFields(f: readonly FieldId[] | undefined): void
  setup(): Setup
  setSetup(s: Setup): void
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

const isRole = (s: string | undefined): s is (typeof COLOR_KEYS)[number] => (COLOR_KEYS as readonly string[]).includes(s ?? '')
const noRole = (s: string) => `No color role named "${shown(s)}". Roles: ${COLOR_KEYS.join(', ')}.`

async function colorList(host: Host, ctl: Ctl): Promise<string> {
  const m = ctl.mix()
  const { look } = resolveLook(m, await loadUserPacks(host), await loadUserThemes(host))
  const over = cleanOverrides(m.overrides) ?? {}
  const rows = COLOR_KEYS.map(k => `${k in over ? '●' : '○'} ${k.padEnd(6)} ${look.theme.colors[k]}  ${ROLE_LABELS[k]}${k in over ? '  (override)' : ''}`)
  return [...rows, '', '● overridden. Set one with /glowup color <role> <#hex>; clear with /glowup color reset [role].'].join('\n')
}

async function setColor(host: Host, ctl: Ctl, role: string, hex: string): Promise<string> {
  if (!isRole(role)) return noRole(role)
  const v = normalizeHex(hex)
  if (!v) return `"${shown(hex)}" is not a color. Use #rgb or #rrggbb.`
  const m = ctl.mix()
  await applyMix(host, ctl, { ...m, overrides: { ...cleanOverrides(m.overrides), [role]: v } })
  return `Color ${role}: ${v}`
}

async function resetColor(host: Host, ctl: Ctl, role: string | undefined): Promise<string> {
  const { overrides, ...rest } = ctl.mix()
  const over = cleanOverrides(overrides) ?? {}
  if (role === undefined) {
    if (!Object.keys(over).length) return 'No color overrides to clear.'
    await applyMix(host, ctl, rest)
    return 'Color overrides cleared.'
  }
  if (!isRole(role)) return noRole(role)
  if (!(role in over)) return `${role} has no override.`
  const { [role]: _, ...left } = over
  await applyMix(host, ctl, Object.keys(left).length ? { ...rest, overrides: left } : rest)
  return `Color ${role}: back to the look's own.`
}

async function usePack(host: Host, ctl: Ctl, name: string): Promise<string> {
  const keep = ctl.mix().overrides
  const mix: Mix = { colors: name, motion: name, ...(keep && { overrides: keep }) }
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

// Each part stands alone: one that fails is named, and the others still apply.
async function packFromLink(host: Host, ctl: Ctl, link: string, force: boolean): Promise<string> {
  const { parts, errors } = decodeLink(link)
  const out = [...errors]
  if (parts.pack !== undefined) {
    const r = await installPackText(host, JSON.stringify(parts.pack, null, 2) + '\n', force)
    if (!r.name) out.push(r.message)
    else {
      const keep = ctl.mix().overrides
      await applyMix(host, ctl, { colors: r.name, motion: r.name, ...(keep && { overrides: keep }) })
      out.push(`Pack: ${r.name}`)
    }
  }
  if (parts.setup !== undefined) {
    const { setup, notices } = parseSetup(parts.setup)
    if (typeof parts.setup !== 'object' || parts.setup === null || Array.isArray(parts.setup)) out.push(`Setup not applied: ${notices[0]}`)
    else if (await ctl.confirm('This link also carries a layout setup (band, tabs, meter, bubbles, pet sleep). Apply it?')) {
      await host.storeSet('setup', setup)
      ctl.setSetup(setup)
      out.push('Setup: applied', ...notices.map(n => `  dropped: ${n}`))
      const sl = (parts.setup as { statusline?: unknown }).statusline
      if (Array.isArray(sl)) {
        const ids = [...new Set(sl.filter((s): s is FieldId => typeof s === 'string' && isFieldId(s)))]
        if (ids.length) {
          await host.storeSet('statusline', ids)
          ctl.setFields(ids)
          out.push(`Status line: ${ids.join(' ')}`)
        }
        for (const s of sl) if (typeof s !== 'string' || !isFieldId(s)) out.push(`  dropped: unknown status line field "${shown(String(s))}"`)
      }
    } else out.push('Setup: kept yours')
  }
  if (parts.pet !== undefined) out.push('This link carries a pet; this glowup cannot install pets yet.')
  return out.join('\n') || 'This link carries nothing to install.'
}

export async function runCommand(host: Host, args: string, ctl: Ctl): Promise<string> {
  const [sub, a1, a2] = args.trim().split(/\s+/)
  // A bare subcommand reports where things stand instead of falling through to Unknown.
  if (sub === 'theme' && !a1) return runCommand(host, 'theme list', ctl)
  if (sub === 'pack' && !a1) return packList(host, ctl)
  if (sub === 'pet' && !a1) return runCommand(host, 'pet list', ctl)
  if (sub === 'bubbles' && !a1) return `Bubbles: ${ctl.bubbles()}. Change it with /glowup bubbles on|off|haiku.`
  if (sub === 'motion' && !a1) return `Motion: ${ctl.reduced() ? 'reduced' : 'full'}. Change it with /glowup motion reduced|full.`
  if (sub === 'statusline' && !a1) return 'Use /glowup statusline on to let glowup draw it, /glowup statusline fields <ids> to pick what it shows, or /glowup statusline restore to put yours back.'
  if (sub === 'color' && (!a1 || a1 === 'list')) return colorList(host, ctl)
  if (sub === 'color' && a1 === 'reset') return resetColor(host, ctl, a2)
  if (sub === 'color') return a2 ? setColor(host, ctl, a1!, a2) : 'Use /glowup color <role> <#hex>, /glowup color list, or /glowup color reset [role].'
  if (sub === 'import' && !a1) return 'Use /glowup import <file> with a Ghostty or base16 scheme; it becomes a pack.'
  if (sub === 'theme' && a1 === 'list') {
    const names = [...new Set([...Object.keys(PRESETS), ...Object.keys(await loadUserThemes(host))])]
    const current = ctl.current()
    return names.map(n => `${n === current ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'theme' && a1 === 'add' && a2) return addTheme(host, a2)
  if (sub === 'theme' && a1 === 'add') return USAGE
  if (sub === 'theme' && a1 === 'default') {
    const { theme: _, ...rest } = ctl.mix()
    await host.storeDelete('theme')
    await applyMix(host, ctl, rest)
    return 'Theme: pack default'
  }
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
  if (sub === 'pack' && a1 && isStudioLink(a1)) return packFromLink(host, ctl, a1, a2 === '--force')
  if (sub === 'pack' && a1?.startsWith('https://')) {
    const r = await addPack(host, a1, a2 === '--force')
    if (!r.name) return r.message
    const keep = ctl.mix().overrides
    await applyMix(host, ctl, { colors: r.name, motion: r.name, ...(keep && { overrides: keep }) })
    return `Pack: ${r.name}`
  }
  if (sub === 'pack' && a1) return usePack(host, ctl, a1)
  if (sub === 'spinner' && a1 === 'list') {
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    return SPINNER_IDS.map(n => `${n === look.motion.spinner ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'spinner' && a1 === 'default') {
    const { spinner: _, ...rest } = ctl.mix()
    await applyMix(host, ctl, rest)
    return 'Spinner: pack default'
  }
  if (sub === 'spinner' && a1) {
    if (!(SPINNER_IDS as readonly string[]).includes(a1)) return `No spinner named "${a1}". Choose one of: ${SPINNER_IDS.join(', ')}.`
    await applyMix(host, ctl, { ...ctl.mix(), spinner: a1 })
    return `Spinner: ${a1}`
  }
  if (sub === 'spinner') return USAGE
  if (sub === 'export') {
    if (a1 !== 'konsole') return 'Export targets: konsole'
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    // An override that failed to resolve falls back to the pack's colors, so name it only when it took effect.
    const over = ctl.mix().theme
    const name = (over !== undefined && look.theme.name === over ? over : look.colorsFrom).replace(/[^a-z0-9-]/g, '-')
    const path = `${host.dataHome}/konsole/glowup-${name}.colorscheme`
    await host.writeFile(path, konsoleScheme(name, look.theme.colors, look.bg))
    return `${path}\nIn Konsole: Settings → Edit Current Profile → Appearance → pick "glowup ${name}".`
  }
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
  if (sub === 'bubbles' && (a1 === 'on' || a1 === 'off' || a1 === 'haiku')) {
    await host.storeSet('bubbles', a1)
    ctl.setBubbles(a1)
    return `Bubbles: ${a1}`
  }
  if (sub === 'pane') return ctl.togglePane()
  if (sub === 'config') return (await ctl.headless()) ? USAGE : ctl.openConfig()
  if (sub === 'motion' && (a1 === 'reduced' || a1 === 'full')) {
    await host.storeSet('reducedMotion', a1 === 'reduced')
    ctl.setMotion(a1 === 'reduced')
    return `Motion: ${a1}.`
  }
  if (sub === 'statusline' && a1 === 'fields') {
    // the only subcommand with a list: the [sub, a1, a2] split stops at two
    const rest = args.trim().split(/\s+/).slice(2)
    const show = () => `Status line fields: ${ctl.fields().join(' ')}`
    if (!rest.length) return show()
    if (rest.length === 1 && rest[0] === 'default') {
      await host.storeDelete('statusline')
      ctl.setFields(undefined)
      return show()
    }
    const bad = rest.filter(s => !isFieldId(s))
    if (bad.length) return `Unknown field${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. Choose from: ${FIELD_IDS.join(', ')}.`
    const ids = [...new Set(rest)] as FieldId[]
    await host.storeSet('statusline', ids)
    ctl.setFields(ids)
    return show()
  }
  if (sub === 'statusline' && a1 === 'on') return takeOver(host, q => ctl.confirm(q))
  if (sub === 'statusline' && a1 === 'restore') return restore(host)
  if (sub === 'setup' && !a1) return describeSetup(ctl.setup())
  if (sub === 'setup' && a1 === 'reset') {
    await host.storeDelete('setup')
    ctl.setSetup(DEFAULT_SETUP)
    return describeSetup(DEFAULT_SETUP)
  }
  if (sub === 'setup' && a1 && a2) {
    const r = setSetupField(ctl.setup(), a1, args.trim().split(/\s+/).slice(2).join(' '))
    if ('error' in r) return r.error
    await host.storeSet('setup', r.setup)
    ctl.setSetup(r.setup)
    return describeSetup(r.setup)
  }
  if (sub === 'setup') return 'Use /glowup setup <key> <value>, /glowup setup, or /glowup setup reset.'
  if (sub === 'help' && a1 === 'all') return FULL_TEXT
  return sub && sub !== 'help' ? `Unknown: ${args.trim()}\n\n${SHORT_TEXT}` : SHORT_TEXT
}
