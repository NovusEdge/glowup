import { index, route, layout, type RouteConfig } from '@react-router/dev/routes'
import { pathOf, slugs } from '../pages.ts'

export default [
  layout('routes/chrome.tsx', [
    index('routes/landing.tsx'),
    route('spinners', 'routes/spinners.tsx'),
    route('gallery', 'routes/gallery.tsx'),
    layout('routes/shell.tsx', [
      ...slugs().map(slug => route(pathOf(slug), 'routes/doc.tsx', { id: `doc-${slug}` })),
      route('*', 'routes/not-found.tsx'),
    ]),
  ]),
] satisfies RouteConfig
