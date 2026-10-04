import { isUnsafe } from './themes.ts'

export type Mood = 'done' | 'fail' | 'needs-you'
export type BubbleSetting = 'off' | 'on'
export type BubbleVars = { file?: string; n?: number; command?: string; agent?: string }
export const BUBBLE_MAX = 40
export const CLAWD_SAY: Record<Mood, string[]> = {
  done: ['all done', "that's a wrap", 'done and dusted'],
  fail: ['ouch, {n} failed', 'hmm, red', 'back at it'],
  'needs-you': ['hey, need you', 'your call', 'need a yes on {command}'],
}

export function fill(template: string, v: BubbleVars): string {
  const s = [...template.replace(/\{(file|n|command|agent)\}/g, (_, k: keyof BubbleVars) => String(v[k] ?? '…'))].filter(c => !isUnsafe(c.codePointAt(0)!)).join('')
  const cps = [...s]
  return cps.length > BUBBLE_MAX ? cps.slice(0, BUBBLE_MAX - 1).join('') + '…' : s
}

export function pickLine(lines: string[], last: string | undefined, rand: () => number): string {
  const pool = lines.length > 1 ? lines.filter(l => l !== last) : lines
  return pool[Math.floor(rand() * pool.length)] ?? ''
}

export function bubbleFor(mood: Mood, vars: BubbleVars, last: string | undefined, rand: () => number) {
  const template = pickLine(CLAWD_SAY[mood], last, rand)
  return { text: fill(template, vars), template }
}
