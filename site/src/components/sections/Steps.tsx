// Setup in three steps, laid out like Brier's "How to trade" list: a grey tile with the app's own
// screen rising into it, then "Step N", a short heading and one line.
import { STEPS, STEPS_TITLE } from '../../content/site'
import { Reveal } from '../Reveal'

export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className="content-column mt-20 lg:mt-28">
      <h2 id="how-title" className="headline text-[30px] text-balance text-ink lg:text-[42px]">
        {STEPS_TITLE}
      </h2>
      <Reveal as="ol" className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 md:gap-12 xl:grid-cols-3 xl:gap-6">
        {STEPS.map((step, i) => (
          <li key={step.title} className="md:grid md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-center md:gap-10 xl:block">
            <div data-testid="step-picture" className="flex aspect-[4/3] justify-center overflow-hidden rounded-[20px] bg-well px-4 pt-6 sm:pt-8">
              <img
                src={step.image}
                alt={step.alt}
                width={760}
                height={1360}
                loading="lazy"
                decoding="async"
                className="rise-in panel block h-auto w-[64%] max-w-[300px] self-start rounded-[12px]"
              />
            </div>
            <div className="mt-5 md:mt-0 xl:mt-5">
              <p className="text-[13px] leading-[18px] text-g500">Step {i + 1}</p>
              <h3 className="headline mt-1 text-[22px] text-ink">{step.title}</h3>
              <p className="mt-2 max-w-[44ch] text-[16px] leading-[26px] text-pretty text-g500">{step.body}</p>
            </div>
          </li>
        ))}
      </Reveal>
    </section>
  )
}
