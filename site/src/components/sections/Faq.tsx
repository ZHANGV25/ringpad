// Questions, as Brier's home page asks them: the heading and a link to the full guide in the left
// third, native <details> rows between hairlines in the rest.
import { FAQ_GUIDE, FAQ_TITLE, QUESTIONS, SETUP_URL } from '../../content/site'
import { LinkButton } from '../LinkButton'

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-g500 transition-transform duration-200 group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="content-column mt-24 grid gap-8 lg:mt-32 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-4">
        <h2 id="faq-title" className="headline text-[30px] text-balance text-ink lg:text-[42px]">
          {FAQ_TITLE}
        </h2>
        <LinkButton href={SETUP_URL} variant="outline" glyph="external" className="mt-6">
          {FAQ_GUIDE}
        </LinkButton>
      </div>
      <div className="lg:col-span-8">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="group border-b border-g200 first:border-t">
            <summary className="typ-title-x10 flex min-h-12 list-none items-center justify-between gap-4 py-3 text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              {item.question}
              <Chevron />
            </summary>
            <p className="max-w-[64ch] pb-4 text-[16px] leading-[26px] text-pretty text-ink">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
