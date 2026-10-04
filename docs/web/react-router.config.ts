import type { Config } from '@react-router/dev/config'
import { allPaths } from './pages.ts'

export default {
  ssr: false,
  basename: '/',
  // api/search is the static search index the client fetches; prerendering writes it as a file.
  prerender: [...allPaths(), '/api/search'],
} satisfies Config
