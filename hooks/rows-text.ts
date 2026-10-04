// JSX-free: rows.tsx and the docs gallery draw the same marks and tags.
export const MARKS = {
  cards: { done: '✓', fail: '✗', stop: '■', run: '…' },
  retro: { done: '[ OK ]', fail: '[FAIL]', stop: '[STOP]', run: '[....]' },
}

export const retroTag = (tool: string): string => `[${tool.toUpperCase().slice(0, 6).padEnd(6)}] `
