import { pageMeta, softwareJsonLd, SUMMARY } from '../lib/seo'
import { PackProvider, usePack } from '../landing/PackContext'
import { Dither } from '../landing/Dither'
import { Nav } from '../landing/Nav'
import { Hero } from '../landing/Hero'
import { Terminal } from '../landing/Terminal'
import { ClawdSection } from '../landing/ClawdSection'
import { SpinnersSection } from '../landing/SpinnersSection'
import { PacksSection } from '../landing/PacksSection'
import { MakerSection } from '../landing/MakerSection'
import { Footer } from '../landing/Footer'
import '../landing/landing.css'
import '../landing/terminal.css'

export const meta = () => pageMeta({ title: 'glowup', description: SUMMARY, path: '/' })

function Background() {
  return <Dither look={usePack().look} />
}

export default function Landing() {
  return (
    <PackProvider>
      <Background />
      <Nav />
      <main className="wrap">
        <Hero />
        <Terminal />
        <ClawdSection />
        <SpinnersSection />
        <PacksSection />
        <MakerSection />
        <Footer />
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd()) }} />
    </PackProvider>
  )
}
