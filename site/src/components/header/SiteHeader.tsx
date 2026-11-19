'use client'

// The header, as briertradinggroup.com draws it: a plain bar on paper at the top of the page that
// turns into a frosted floating capsule after 8px of scroll. Desktop: the wordmark, three links
// with a pill that slides behind them, GitHub and the one ink Download pill. Phone: the wordmark,
// Download and a 44px menu button that opens a native <dialog> sheet from the top.
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { DOWNLOAD_URL, NAV_LINKS, REPO_URL } from '../../content/site'
import { cn } from '../cn'
import { LinkButton } from '../LinkButton'
import { Wordmark } from '../RingpadMark'
import { useNavIndicator, useSectionSpy } from './useNavIndicator'
import { useScrolled } from './useScrolled'

const SECTION_IDS: readonly string[] = NAV_LINKS.map((link) => link.href.slice(1))

interface MenuIconProps {
  readonly open: boolean
}

// Two 18px lines that cross into an × while the menu is open.
function MenuIcon({ open }: MenuIconProps) {
  return (
    <span aria-hidden="true" className="relative block size-[18px]">
      <span className={cn('absolute top-[4px] left-0 h-px w-[18px] bg-ink transition-transform duration-200', open && 'translate-y-[4.5px] rotate-45')} />
      <span className={cn('absolute top-[13px] left-0 h-px w-[18px] bg-ink transition-transform duration-200', open && '-translate-y-[4.5px] -rotate-45')} />
    </span>
  )
}

function DesktopNav() {
  const navRef = useRef<HTMLElement>(null)
  const spied = useSectionSpy(SECTION_IDS)
  const resting = spied === null ? null : `#${spied}`
  const { onEnter, onLeave } = useNavIndicator(navRef, resting)
  return (
    <nav ref={navRef} aria-label="Main" className="site-nav hidden lg:block" onPointerLeave={onLeave}>
      <span aria-hidden="true" className="nav-indicator" />
      <ul className="flex items-center">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              data-resting={resting === link.href}
              onPointerEnter={() => onEnter(link.href)}
              onFocus={() => onEnter(link.href)}
              onBlur={onLeave}
              className="nav-link block rounded-full px-3 py-1.5 text-[14px] leading-5 font-medium no-underline"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function SiteHeader() {
  useScrolled()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDialogElement>(null)
  const close = (): void => setOpen(false)

  useEffect(() => {
    const dialog = sheetRef.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === sheetRef.current) close()
  }

  return (
    <header className="site-header">
      <div className="site-capsule">
        <div className="site-bar flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Wordmark />
            <DesktopNav />
          </div>
          <div className="flex items-center gap-2">
            <LinkButton href={REPO_URL} variant="ghost" glyph="external" className="hidden sm:inline-flex">
              GitHub
            </LinkButton>
            <LinkButton href={DOWNLOAD_URL} variant="primary" glyph="download">
              Download
            </LinkButton>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink hover:bg-g100 lg:hidden"
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </div>
      <dialog
        ref={sheetRef}
        aria-label="Menu"
        data-testid="site-menu"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={onBackdropClick}
        className="sheet-top pointer-events-auto fixed inset-x-0 top-0 m-0 max-h-[100dvh] w-full max-w-none overflow-y-auto bg-paper text-ink lg:hidden"
      >
        <div className="content-column pb-6">
          <div className="flex h-14 items-center justify-between">
            <Wordmark onClick={close} />
            <button type="button" aria-label="Close menu" onClick={close} className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink hover:bg-g100">
              <MenuIcon open />
            </button>
          </div>
          <nav aria-label="Menu">
            <ul className="stagger flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} onClick={close} className="flex h-13 items-center text-[20px] leading-7 font-medium text-ink no-underline">
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="pt-3">
                <LinkButton href={DOWNLOAD_URL} variant="primary" size="lg" glyph="download" className="h-12 w-full">
                  Download for Windows
                </LinkButton>
              </li>
              <li className="pt-2">
                <LinkButton href={REPO_URL} variant="ghost" size="lg" glyph="external" className="w-full">
                  View on GitHub
                </LinkButton>
              </li>
            </ul>
          </nav>
        </div>
      </dialog>
    </header>
  )
}
