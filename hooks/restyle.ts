import type { Theme } from './themes.ts'

export const spinnerWord = (_t: Theme, engineWord: string, _reduced: boolean): string => engineWord
export const newTurnWord = (): void => {}
export const toolGlyph = (_t: Theme, _tool: string): { glyph: string; color: string } | undefined => undefined
