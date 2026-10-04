import type { Host } from './host.ts'

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
  setTheme(name: string): Promise<void>
  togglePane(): Promise<string>
  setMotion(reduced: boolean): void
  confirm(question: string): Promise<boolean>
}

export async function runCommand(_host: Host, args: string, _ctl: Ctl): Promise<string> {
  return args.trim() ? `Unknown: ${args.trim()}\n\n${USAGE}` : USAGE
}
