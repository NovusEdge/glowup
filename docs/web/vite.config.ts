import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import mdx from 'fumadocs-mdx/vite'
import * as MdxConfig from './source.config.ts'

export default defineConfig({
  base: '/',
  plugins: [mdx(MdxConfig), tailwindcss(), reactRouter()],
  // The landing page reads the theme presets straight from the mod's source.
  server: { fs: { allow: ['../..'] } },
})
