// What Ringpad does, as Brier lists what a trader gets: a heading, then short items between
// hairlines, two to a row on a wide screen.
import { FEATURES, FEATURES_TITLE } from '../../content/site'

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="content-column mt-20 lg:mt-28">
      <h2 id="features-title" className="headline text-[30px] text-balance text-ink lg:text-[42px]">
        {FEATURES_TITLE}
      </h2>
      <ul className="mt-10 grid gap-x-12 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="border-t border-g200 py-6">
            <h3 className="text-[18px] leading-7 font-semibold text-ink">{feature.title}</h3>
            <p className="mt-2 max-w-[60ch] text-[16px] leading-[26px] text-pretty text-ink">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
