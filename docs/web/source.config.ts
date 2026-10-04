import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import { remarkGuides } from './app/lib/remark-guides.ts'

// docs/*.md are the guides GitHub also renders. Only top-level files: the defaults (**/*) would sweep
// docs/web's package.json and node_modules into the meta collection.
export const docs = defineDocs({
  dir: '..',
  docs: { files: ['*.md'] },
  meta: { files: ['meta.json'] },
})

export default defineConfig({
  // remarkImage resolves /media/x.png against public/, which no longer holds the images
  // (copy-assets.ts copies docs/assets into the build), so it is off and the guides' images stay plain <img>.
  mdxOptions: { remarkImageOptions: false, remarkPlugins: v => [remarkGuides, ...v] },
})
