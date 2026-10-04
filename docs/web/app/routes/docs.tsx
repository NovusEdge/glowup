import { useFumadocsLoader } from 'fumadocs-core/source/client'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import browserCollections from '../../.source/browser'
import { baseOptions } from '../lib/layout'
import { SUMMARY, pageMeta } from '../lib/seo'
import { source } from '../lib/source'
import type { Route } from './+types/docs'

export async function loader({ request }: Route.LoaderArgs) {
  // Prerendering also requests `/<slug>.data`, the single-fetch payload.
  const slug = new URL(request.url).pathname.replace(/\.data$/, '').replace(/^\/|\/$/g, '')
  const page = source.getPage([slug])
  if (!page) throw new Response('', { status: 404 })
  return {
    path: page.path,
    slug,
    title: page.data.title,
    description: page.data.description,
    tree: await source.serializePageTree(source.getPageTree()),
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? pageMeta({ title: `${loaderData.title} · glowup`, description: loaderData.description ?? SUMMARY, path: `/${loaderData.slug}` })
    : [{ title: 'glowup' }]

const content = browserCollections.docs.createClientLoader({
  id: 'docs',
  component({ toc, default: Mdx }, props: { title: string; description?: string }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{props.title}</DocsTitle>
        <DocsDescription>{props.description}</DocsDescription>
        <DocsBody>
          <Mdx components={defaultMdxComponents} />
        </DocsBody>
      </DocsPage>
    )
  },
})

export default function Docs({ loaderData }: Route.ComponentProps) {
  const { path, title, description, tree } = useFumadocsLoader(loaderData)
  return (
    <DocsLayout tree={tree} {...baseOptions}>
      {content.useContent(path, { title, description })}
    </DocsLayout>
  )
}
