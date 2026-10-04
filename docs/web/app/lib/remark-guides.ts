import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

// The guides link to each other as `themes.md` and to images as `assets/x.png` so they work on GitHub.
// Runs before fumadocs' remarkImage, which would otherwise try to import assets/x.png as a module.
export function remarkGuides() {
  return (tree: Root) => {
    visit(tree, ['link', 'image'], (node: any) => {
      const page = /^([a-z0-9-]+)\.md(#.*)?$/.exec(node.url)
      if (page) node.url = `/${page[1]}${page[2] ?? ''}`
      else if (/^assets\/[^/]+$/.test(node.url)) node.url = '/' + node.url.replace(/^assets\//, 'media/')
    })
  }
}
