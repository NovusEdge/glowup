import type { Config } from '@react-router/dev/config'
import { allPaths } from './pages.ts'

export default {
  ssr: false,
  basename: '/',
  prerender: allPaths(),
} satisfies Config
