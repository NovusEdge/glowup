import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const baseOptions: BaseLayoutProps = {
  nav: { title: 'glowup', url: '/' },
  // The site is dark only, so there is nothing to toggle.
  themeSwitch: { enabled: false },
}
