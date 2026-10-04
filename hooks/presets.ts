import type { ThemeFile } from './themes.ts'

// classic is Claude Code's own palette; every other preset extends it.
export const PRESETS: Record<string, ThemeFile> = {
  classic: {
    name: 'classic',
    colors: {
      accent: '#d77757', text: '#e4e4e7', dim: '#8b8b94', faint: '#3a3a42',
      read: '#7dc4e4', edit: '#e5b567', shell: '#4eba65', agent: '#b39ddb',
      pass: '#4eba65', fail: '#ff6b80', panel: '#1f1f24', addBg: '#1f3a26', delBg: '#4a2228', sel: '#2a2a33',
    },
    spinner: { words: ['Thinking'] },
    glyphs: { read: '▸', search: '⌕', edit: '✎', shell: '$', agent: '◆', plan: '◇' },
    band: { hearts: ['♥', '♡'] },
  },
  cyberpunk: {
    name: 'cyberpunk', extends: 'classic',
    colors: { accent: '#ff2bd6', text: '#e4dcff', dim: '#7d7398', faint: '#2d1f45', read: '#00e5ff', edit: '#ffb000', shell: '#39ff88', agent: '#b388ff', pass: '#39ff88', fail: '#ff3b5c', panel: '#140c22', addBg: '#0f3324', delBg: '#3d1020', sel: '#24123a' },
    spinner: { words: ['Jacking in', 'Compiling', 'Glowing'] },
  },
  vaporwave: {
    name: 'vaporwave', extends: 'classic',
    colors: { accent: '#ff71ce', text: '#ffe3f6', dim: '#a08bc0', faint: '#4a2d70', read: '#01cdfe', edit: '#fffb96', shell: '#05ffa1', agent: '#b967ff', pass: '#05ffa1', fail: '#ff6b6b', panel: '#24123f', addBg: '#123a3a', delBg: '#4a1a3a', sel: '#3a1d5c' },
    spinner: { words: ['Vibing', 'Drifting', 'Glowing'] },
  },
  'high-contrast': {
    name: 'high-contrast', extends: 'classic',
    colors: { accent: '#ffff00', text: '#ffffff', dim: '#d0d0d0', faint: '#808080', read: '#00ffff', edit: '#ffaa00', shell: '#00ff00', agent: '#ff80ff', pass: '#00ff00', fail: '#ff4040', panel: '#000000', addBg: '#003300', delBg: '#440000', sel: '#333333' },
  },
}
