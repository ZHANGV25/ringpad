'use client'

// The 12-second demo: muted, looping and inline, so it plays like a moving picture. It plays only
// while it is on screen, and under reduced motion it stays on its poster with the controls showing,
// so a visitor starts it when they want to.
import { useEffect, useRef, useState } from 'react'

const POSTER = '/media/ringpad-demo-poster.webp'
const VISIBLE_AT = 0.35

export function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (video === null) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    if (query.matches) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined)
        else video.pause()
      },
      { threshold: VISIBLE_AT },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="metadata"
      poster={POSTER}
      controls={reduced}
      width={760}
      height={1360}
      data-testid="demo-video"
      className="block aspect-[380/680] h-auto w-full bg-white"
    >
      <source src="/media/ringpad-demo.webm" type="video/webm" />
      <source src="/media/ringpad-demo.mp4" type="video/mp4" />
    </video>
  )
}
