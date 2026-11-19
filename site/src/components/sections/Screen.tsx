// The app at work, on the light grey stage Brier stands its laptop on: the heading and the keys at
// the left, and the Ringpad window playing the demo at the right, rising in as it scrolls into view.
import { KEYS, KEYS_NOTE, SCREEN } from '../../content/site'
import { Reveal } from '../Reveal'
import { AppWindow } from './AppWindow'
import { DemoVideo } from './DemoVideo'

interface KeyCapProps {
  readonly label: string
}

function KeyCap({ label }: KeyCapProps) {
  return (
    <kbd className="inline-flex h-7 min-w-9 items-center justify-center rounded-[7px] border border-g300 bg-surface px-2 font-sans text-[13px] leading-none font-semibold text-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.08)]">
      {label}
    </kbd>
  )
}

function KeyList() {
  return (
    <dl className="mt-10 border-t border-g200">
      {KEYS.map((row) => (
        <div key={row.does} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-4 border-b border-g200 py-3.5 text-[16px] leading-6 sm:text-[17px] sm:leading-7">
          <dt className="flex items-center gap-1.5">
            {row.keys.map((key, i) => (
              <span key={key} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-[13px] text-g500">then</span> : null}
                <KeyCap label={key} />
              </span>
            ))}
          </dt>
          <dd className="font-medium text-ink">{row.does}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Screen() {
  return (
    <section id="screen" aria-labelledby="screen-title" className="mt-2 px-2 sm:mt-4 sm:px-4 lg:mt-6 lg:px-6">
      <Reveal className="squircle stage-light overflow-hidden">
        <div className="content-column grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-6 xl:col-span-5">
            <h2 id="screen-title" className="headline text-[34px] text-balance text-ink sm:text-[44px] lg:text-[56px]">
              {SCREEN.title}
            </h2>
            <p className="mt-4 max-w-[50ch] text-[18px] leading-7 text-pretty text-ink">{SCREEN.lead}</p>
            <KeyList />
            <p className="mt-4 text-[13px] leading-[18px] text-g500">{KEYS_NOTE}</p>
          </div>
          <div className="lg:col-span-6 xl:col-span-6 xl:col-start-7">
            <figure className="rise-in mx-auto w-full max-w-[340px] sm:max-w-[380px]">
              <AppWindow>
                <DemoVideo />
              </AppWindow>
              <figcaption className="sr-only">{SCREEN.alt}</figcaption>
            </figure>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
