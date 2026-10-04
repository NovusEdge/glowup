import type { Config } from '@react-router/dev/config'
import { allPaths } from './pages.ts'

export default {
  ssr: false,
  basename: '/glowup/',
  prerender: allPaths(),
} satisfies Config
