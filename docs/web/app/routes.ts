import { index, route, type RouteConfig } from '@react-router/dev/routes'
import { pathOf, slugs } from '../pages.ts'

export default [
  index('routes/landing.tsx'),
  ...slugs().map(slug => route(pathOf(slug), 'routes/docs.tsx', { id: `doc-${slug}` })),
  route('studio', 'routes/studio.tsx'),
  route('api/search', 'routes/search.ts'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig
