import { useState } from 'react'
import { Panda } from '../components/panda/Panda'
import type { PandaCue, PandaMood } from '../components/panda/Panda'
import { ALL_MOVES } from '../components/panda/moves'

const MOODS: PandaMood[] = ['idle', 'listening', 'happy', 'talking', 'sleeping', 'confused', 'celebrate']

/** Development only (open /?panda): every mood and move at a size where you can judge them. */
export function PandaLab() {
  const [mood, setMood] = useState<PandaMood>('idle')
  const [cue, setCue] = useState<PandaCue | null>(null)
  const [size, setSize] = useState(240)
  const [level, setLevel] = useState(0.4)
  return (
    <main style={{ display: 'grid', gap: 12, padding: 16, height: '100%', overflow: 'auto', alignContent: 'start' }}>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: size * 1.2 + 20 }}>
        <Panda mood={mood} size={size} cue={cue} level={mood === 'talking' ? level : 0} label="Panda" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MOODS.map((name) => (
          <button key={name} type="button" className={`button small ${mood === name ? 'primary' : ''}`} onClick={() => setMood(name)}>
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ALL_MOVES.map((kind) => (
          <button key={kind} type="button" className="button small ghost" onClick={() => setCue((last) => ({ kind, id: (last?.id ?? 0) + 1 }))}>
            {kind}
          </button>
        ))}
      </div>
      <label className="muted small">
        size {size}
        <input type="range" min={40} max={400} value={size} onChange={(event) => setSize(Number(event.target.value))} />
      </label>
      <label className="muted small">
        talk level {level.toFixed(2)}
        <input type="range" min={0} max={1} step={0.01} value={level} onChange={(event) => setLevel(Number(event.target.value))} />
      </label>
    </main>
  )
}
