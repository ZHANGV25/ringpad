import type { Metadata, Viewport } from 'next'
import { Archivo, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { SITE_DESCRIPTION, SITE_TITLE } from '../content/site'
import './site.css'

// Brier's two faces: Inter for words, Archivo (with its width axis) for headings.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap', axes: ['wdth'] })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ringpad.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Ringpad: instant replay for voice chat' }],
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: ['/og.png'] },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
}

interface RootLayoutProps {
  readonly children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
