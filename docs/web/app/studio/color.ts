export type Hsv = { h: number; s: number; v: number }

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1, 7), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const k = (n: number) => (n + (((h % 360) + 360) % 360) / 60) % 6
  const f = (n: number) => Math.round((v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1))) * 255)
  return '#' + [f(5), f(3), f(1)].map(c => c.toString(16).padStart(2, '0')).join('')
}
