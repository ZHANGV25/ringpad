import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/header/SiteHeader'
import { Closer } from '../components/sections/Closer'
import { Faq } from '../components/sections/Faq'
import { Features } from '../components/sections/Features'
import { Hero } from '../components/sections/Hero'
import { Screen } from '../components/sections/Screen'
import { Steps } from '../components/sections/Steps'

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-30 rounded-full bg-ink px-4 py-2 text-on-ink no-underline focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Screen />
        <Steps />
        <Features />
        <Faq />
        <Closer />
      </main>
      <Footer />
    </>
  )
}
