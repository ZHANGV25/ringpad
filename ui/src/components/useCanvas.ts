import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { onPaletteChange, palette } from '../lib/palette'
import type { Palette } from '../lib/palette'
import { schedule, unschedule } from '../lib/ticker'

export interface Surface {
  context: CanvasRenderingContext2D
  /** Size in device pixels. */
  width: number
  height: number
  dpr: number
  colors: Palette
}

export type Paint = (surface: Surface) => void

/**
 * A canvas that is sized only when its box changes (in exact device pixels, so lines stay crisp)
 * and painted only when asked, in the shared frame (lib/ticker). Painting reads the latest data
 * through `paint`, which may change every render.
 */
export function useCanvas(paint: Paint): { ref: (canvas: HTMLCanvasElement | null) => void; invalidate: () => void } {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintRef = useRef(paint)
  useLayoutEffect(() => {
    paintRef.current = paint
  })
  const jobRef = useRef<(() => boolean) | null>(null)

  if (jobRef.current === null) {
    jobRef.current = () => {
      const canvas = canvasRef.current
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false
      let context: CanvasRenderingContext2D | null = null
      try {
        context = canvas.getContext('2d')
      } catch {
        context = null
      }
      if (!context) return false
      context.clearRect(0, 0, canvas.width, canvas.height)
      paintRef.current({ context, width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio || 1, colors: palette() })
      return false
    }
  }

  const invalidate = useCallback(() => {
    if (jobRef.current) schedule(jobRef.current)
  }, [])

  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      canvasRef.current = canvas
      if (!canvas) return
      const resize = (width: number, height: number) => {
        const w = Math.max(1, Math.round(width))
        const h = Math.max(1, Math.round(height))
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        invalidate()
      }
      if (typeof ResizeObserver !== 'function') {
        const box = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        resize(box.width * dpr, box.height * dpr)
        return
      }
      observer.current = new ResizeObserver(([entry]) => {
        const exact = entry.devicePixelContentBoxSize?.[0]
        if (exact) resize(exact.inlineSize, exact.blockSize)
        else {
          const dpr = window.devicePixelRatio || 1
          resize(entry.contentRect.width * dpr, entry.contentRect.height * dpr)
        }
      })
      try {
        observer.current.observe(canvas, { box: 'device-pixel-content-box' })
      } catch {
        observer.current.observe(canvas)
      }
    },
    [invalidate],
  )

  useEffect(() => {
    const off = onPaletteChange(invalidate)
    const job = jobRef.current
    return () => {
      off()
      observer.current?.disconnect()
      if (job) unschedule(job)
    }
  }, [invalidate])

  return { ref, invalidate }
}
