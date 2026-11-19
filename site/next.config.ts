import type { NextConfig } from 'next'

// One static page: `next build` writes it to out/, which Vercel serves as files. Pictures are
// already sized and compressed in public/media, so the image optimizer is off.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
}

export default config
