export const SITE = 'https://glowup.khimani.dev'
export const SUMMARY = 'A mod that makes Claude Code look nicer. Themes, packs, spinners, and a pet named Clawd.'
const REPO = 'https://github.com/NovusEdge/glowup'

export function pageMeta({ title, description, path }: { title: string; description: string; path: string }): Array<Record<string, string>> {
  const url = SITE + path
  return [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: url },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: `${SITE}/og.png` },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
}

export const softwareJsonLd = (): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'glowup',
  description: SUMMARY,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Linux, Windows',
  url: SITE,
  codeRepository: REPO,
  license: `${REPO}/blob/main/LICENSE`,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
})
