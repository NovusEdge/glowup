import { isDev, tidy } from './instances.ts'

export const INSTALLED_FILE = (configDir: string) => `${configDir}/plugins/installed_plugins.json`

// A session keeps the copy it loaded; `claude plugin update` records a newer folder in
// installed_plugins.json and only /reload-plugins moves the session onto it. The entry is
// found by the marketplace and plugin in this copy's own cache path, so a fork published
// under another marketplace name is compared with its own entry.
export function staleCopy(installedJson: unknown, root: string, configDir: string): string | undefined {
  if (isDev(configDir, root)) return undefined
  const [market, plugin] = tidy(root).slice(`${tidy(configDir)}/plugins/cache/`.length).split('/')
  const key = market && plugin ? `${plugin}@${market}` : 'glowup@glowup'
  const plugins = (installedJson as { plugins?: Record<string, unknown> } | null | undefined)?.plugins
  const entries = plugins && typeof plugins === 'object' ? plugins[key] : undefined
  const hit = Array.isArray(entries) ? entries.find(e => typeof e?.installPath === 'string') : undefined
  if (!hit || tidy(hit.installPath) === tidy(root)) return undefined
  return typeof hit.version === 'string' && hit.version ? hit.version : hit.installPath.split('/').filter(Boolean).pop()
}

const ownVersion = (root: string) => tidy(root).split('/').pop() ?? ''

// `shown` holds the versions already announced; a beat every minute must not repeat one.
export function staleToast(shown: Set<string>, installedJson: unknown, root: string, configDir: string): string | undefined {
  const v = staleCopy(installedJson, root, configDir)
  if (v === undefined || shown.has(v)) return undefined
  shown.add(v)
  return `glowup ${v} is installed, but this session runs ${ownVersion(root)}. Run /reload-plugins to switch.`
}
