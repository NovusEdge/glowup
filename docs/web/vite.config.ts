import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readMetas } from './pages.ts'

export default defineConfig({
  base: '/glowup/',
  plugins: [tailwindcss(), reactRouter()],
  // The landing page reads the theme presets straight from the mod's source.
  server: { fs: { allow: ['../..'] } },
  define: { __NAV__: JSON.stringify(readMetas().map(({ slug, title, section }) => ({ slug, title, section }))) },
})
