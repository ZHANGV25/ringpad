// The opening panel, built like briertradinggroup.com's: a dark squircle inset from the window
// edges that wipes up as the page opens, the headline, one line, the one light pill, and four
// figures on frosted tiles. Where Brier has a photo, Ringpad has its own tape: the last 30 seconds
// as a waveform, with the 5 seconds F8 would clip lit up at the right.
import { DOWNLOAD_URL, FIGURES, HERO } from '../../content/site'
import { tapeBars } from '../../content/tape'
import { LinkButton } from '../LinkButton'

const BAR_COUNT = 250
const CLIP_BARS = 30
const BAR_STEP = 6
const BAR_WIDTH = 3
const TAPE_HEIGHT = 120
const BARS = tapeBars(BAR_COUNT)

function Tape() {
  const width = BAR_COUNT * BAR_STEP
  const clipStart = (BAR_COUNT - CLIP_BARS) * BAR_STEP - BAR_STEP / 2
  return (
    <div aria-hidden="true" className="relative">
      <p className="mb-3 flex justify-end text-[13px] leading-[18px] text-white/70">
        <span className="flex items-center gap-2">
          {HERO.tapeLabel}
          <span className="rounded-[6px] border border-white/30 px-1.5 text-[12px] leading-[18px] font-semibold text-white">F8</span>
        </span>
      </p>
      <div className="flex justify-end overflow-hidden">
        <svg width={width} height={TAPE_HEIGHT} viewBox={`0 0 ${width} ${TAPE_HEIGHT}`} className="h-[88px] w-auto shrink-0 sm:h-[120px]">
          <rect x={clipStart} y="0" width={width - clipStart} height={TAPE_HEIGHT} rx="10" fill="rgb(255 255 255 / 0.08)" />
          {BARS.map((height, i) => {
            const barHeight = Math.max(3, height * (TAPE_HEIGHT - 24))
            const lit = i >= BAR_COUNT - CLIP_BARS
            return (
              <rect
                key={i}
                x={i * BAR_STEP}
                y={(TAPE_HEIGHT - barHeight) / 2}
                width={BAR_WIDTH}
                height={barHeight}
                rx={BAR_WIDTH / 2}
                fill={lit ? '#ffffff' : 'rgb(255 255 255 / 0.24)'}
              />
            )
          })}
          <rect x={width - 2} y="0" width="2" height={TAPE_HEIGHT} fill="#ffffff" />
        </svg>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="px-2 pt-16 sm:px-4 lg:px-6 lg:pt-20">
      <div className="squircle stage-panel wipe-enter relative">
        <div className="content-column flex min-h-[calc(100svh-5rem)] flex-col justify-between gap-12 pt-16 pb-3 sm:pt-20 sm:pb-6 lg:min-h-[calc(100svh-6.5rem)] lg:pt-24 lg:pb-8">
          <div className="stagger max-w-[720px] min-[1700px]:max-w-[900px]">
            <h1 id="hero-title" className="headline text-[38px] text-balance text-white sm:text-[50px] lg:text-[60px] min-[1700px]:text-[78px]">
              {HERO.title}
            </h1>
            <p className="mt-6 max-w-[52ch] text-[18px] leading-7 text-pretty text-white/85">{HERO.lead}</p>
            <LinkButton href={DOWNLOAD_URL} variant="light" size="lg" glyph="download" className="mt-9 w-full sm:w-auto">
              {HERO.download}
            </LinkButton>
          </div>
          <div className="flex flex-col gap-8">
            <Tape />
            <ul aria-label="Ringpad in four figures" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
              {FIGURES.map((figure) => (
                <li key={figure.value} className="glass-dark flex flex-col overflow-hidden rounded-[20px] p-4 sm:rounded-[24px] sm:p-6">
                  <p className="headline tnum text-[26px] text-white sm:text-[36px] lg:text-[42px]">{figure.value}</p>
                  <p className="mt-2 max-w-[26ch] text-[13px] leading-[18px] text-pretty text-white/85 sm:text-[15px] sm:leading-[22px]">{figure.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
