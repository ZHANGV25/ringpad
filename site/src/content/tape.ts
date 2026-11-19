// The hero's waveform: bar heights that look like voices over a game, drawn the same on every
// build so the static page never shifts. A few sines at unrelated rates give speech-like bursts;
// a slow envelope makes the gaps between them.

const MIN_HEIGHT = 0.08

export function tapeBars(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const burst = Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 1.71) * 0.3 + Math.sin(i * 0.11 + 1) * 0.25)
    const envelope = 0.55 + 0.45 * Math.sin(i * 0.083 + 0.6)
    const height = burst * envelope
    return Math.round(Math.min(1, Math.max(MIN_HEIGHT, height)) * 1000) / 1000
  })
}
