// The footer, as Brier's: a hairline, the wordmark and the links on one row, and one line of small
// print.
import { FOOTER_LINE, FOOTER_LINKS } from '../content/site'
import { Wordmark } from './RingpadMark'

export function Footer() {
  return (
    <footer className="mt-20 border-t border-g200 lg:mt-28">
      <div className="content-column flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <Wordmark />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-[14px] leading-5 font-medium text-g500 no-underline transition-colors duration-100 hover:text-ink">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="text-[13px] leading-[18px] text-g500">{FOOTER_LINE}</p>
      </div>
    </footer>
  )
}
