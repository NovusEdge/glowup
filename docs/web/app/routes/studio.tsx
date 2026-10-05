import { pageMeta } from '../lib/seo'
import { Studio } from '../studio/Studio'
import '../landing/landing.css'
import '../landing/terminal.css'
import '../studio/studio.css'

export const meta = () => pageMeta({ title: 'Studio · glowup', description: 'Build a glowup look and setup with a live preview, then share it as a link or a pack file.', path: '/studio/' })

export default function StudioRoute() {
  return <Studio />
}
