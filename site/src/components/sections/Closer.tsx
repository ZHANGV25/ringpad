// The last word, on the same dark panel as Brier's "Make your first trade": a big heading, one
// line, the light pill and the small print, with the panda beside them.
import { CLOSER, DOWNLOAD_URL } from '../../content/site'
import { LinkButton } from '../LinkButton'
import { Reveal } from '../Reveal'
import { RingpadMark } from '../RingpadMark'

export function Closer() {
  return (
    <section id="get" aria-labelledby="get-title" className="mt-24 px-2 sm:px-4 lg:mt-32 lg:px-6">
      <Reveal className="squircle stage-panel overflow-hidden">
        <div className="content-column grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 lg:py-24">
          <div>
            <h2 id="get-title" className="headline text-[42px] text-balance text-white sm:text-[60px] lg:text-[76px]">
              {CLOSER.title}
            </h2>
            <p className="mt-5 max-w-[36ch] text-[20px] leading-[30px] text-pretty text-white/80">{CLOSER.lead}</p>
            <LinkButton href={DOWNLOAD_URL} variant="light" size="lg" glyph="download" className="mt-8 w-full sm:w-auto">
              {CLOSER.download}
            </LinkButton>
            <p className="mt-6 max-w-[48ch] text-[13px] leading-[18px] text-white/55">{CLOSER.smallPrint}</p>
          </div>
          <div className="rise-in mx-auto w-full max-w-[200px] sm:max-w-[260px] lg:max-w-[320px]">
            <div className="aspect-square w-full [&>svg]:size-full">
              <RingpadMark size={320} tile />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
