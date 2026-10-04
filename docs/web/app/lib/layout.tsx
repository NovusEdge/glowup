import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span style={{ font: "700 20px 'Pixelify Sans'" }}>
        glow<span style={{ color: 'var(--color-fd-primary)' }}>up</span>
      </span>
    ),
    url: '/',
  },
  githubUrl: 'https://github.com/NovusEdge/glowup',
  // The site is dark only, so there is nothing to toggle.
  themeSwitch: { enabled: false },
}
