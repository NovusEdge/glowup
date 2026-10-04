import { PackProvider } from '../landing/PackContext'
import { Nav } from '../landing/Nav'
import '../landing/landing.css'

export const meta = () => [{ title: 'Not found · glowup' }, { name: 'robots', content: 'noindex' }]

export default function NotFound() {
  return (
    <PackProvider>
      <Nav />
      <main className="wrap">
        <h1>No page here.</h1>
        <p><a href="/">Home</a> · <a href="/install">Docs</a></p>
      </main>
    </PackProvider>
  )
}
