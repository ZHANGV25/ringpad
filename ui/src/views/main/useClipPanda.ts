import { useEffect, useRef, useState } from 'react'
import type { PandaCue, PandaMood } from '../../components/panda/Panda'
import type { EngineStatus, PadInfo } from '../../engine/types'
import { useEngine, useMeters } from '../../state/EngineProvider'

/** Source level above which the panda hears something. */
const HEAR_LEVEL = 0.06
/** Keeps listening through short gaps so the mood does not flicker between words. */
const HEAR_HOLD_MS = 1200
/** No sound and no pointer for this long and the panda dozes off. */
export const DOZE_MS = 45_000
export const HAPPY_MS = 1800
/** Two loops of the celebrate hop, so it ends on the ground. */
export const CELEBRATE_MS = 2200

export interface ClipPanda {
  mood: PandaMood
  level: number
  cue: PandaCue | null
}

/** What the panda in the clip card is doing, from the engine's state. */
export function useClipPanda(): ClipPanda {
  const { state } = useEngine()
  const meters = useMeters()
  const hearing = useHeld(meters.source > HEAR_LEVEL, HEAR_HOLD_MS)
  const { moment, cue } = useMoments()
  const busy = hearing || state.playback.sending || state.playback.previewing
  const dozing = useDozing(busy)
  const mood = pickMood({
    status: state.status.kind,
    error: state.notice !== null,
    sending: state.playback.sending,
    previewing: state.playback.previewing,
    moment,
    hearing,
    dozing,
  })
  return { mood, level: meters.outgoing, cue }
}

interface MoodInputs {
  status: EngineStatus['kind']
  error: boolean
  sending: boolean
  previewing: boolean
  moment: PandaMood | null
  hearing: boolean
  dozing: boolean
}

export function pickMood(input: MoodInputs): PandaMood {
  if (input.status === 'needsSetup' || input.status === 'stopped' || input.error) return 'confused'
  if (input.sending) return 'talking'
  if (input.moment) return input.moment
  // Starting up looks like waking up.
  if (input.status === 'starting') return 'sleeping'
  if (input.previewing || input.hearing) return 'listening'
  return input.dozing ? 'sleeping' : 'idle'
}

/** True while `on`, and for `holdMs` after it last was. */
function useHeld(on: boolean, holdMs: number): boolean {
  const [held, setHeld] = useState(on)
  useEffect(() => {
    if (on) {
      setHeld(true)
      return undefined
    }
    const timer = window.setTimeout(() => setHeld(false), holdMs)
    return () => window.clearTimeout(timer)
  }, [on, holdMs])
  return on || held
}

/** A short happy moment for a new clip and a celebration when a pad gets a new sound. */
function useMoments(): { moment: PandaMood | null; cue: PandaCue | null } {
  const { api, state } = useEngine()
  const [moment, setMoment] = useState<PandaMood | null>(null)
  const [cue, setCue] = useState<PandaCue | null>(null)
  const pads = useRef(state.pads)
  const timer = useRef(0)

  useEffect(() => {
    pads.current = state.pads
  }, [state.pads])

  useEffect(() => {
    const show = (next: PandaMood, ms: number, kind: PandaCue['kind'] | null) => {
      setMoment(next)
      if (kind) setCue((last) => ({ kind, id: (last?.id ?? 0) + 1 }))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMoment(null), ms)
    }
    const offClip = api.onClip(() => show('happy', HAPPY_MS, 'hop'))
    const offPads = api.onPads((next) => {
      const gained = gainedSound(pads.current, next)
      pads.current = next
      if (gained) show('celebrate', CELEBRATE_MS, null)
    })
    return () => {
      offClip()
      offPads()
      window.clearTimeout(timer.current)
    }
  }, [api])

  return { moment, cue }
}

/** Whether any pad now holds a different sound. Renaming, volume and key changes do not count. */
export function gainedSound(before: Array<PadInfo | null>, after: Array<PadInfo | null>): boolean {
  return after.some((pad, slot) => pad !== null && soundOf(pad) !== soundOf(before[slot] ?? null))
}

function soundOf(pad: PadInfo | null): string {
  return pad ? `${pad.seconds}:${pad.peaks.slice(0, 16).join(',')}` : ''
}

/** Dozes after DOZE_MS without sound, playback or the pointer moving; any of those wakes it. */
function useDozing(busy: boolean): boolean {
  const [dozing, setDozing] = useState(false)
  const lastActive = useRef(Date.now())

  useEffect(() => {
    if (busy) lastActive.current = Date.now()
  })

  useEffect(() => {
    const wake = () => {
      lastActive.current = Date.now()
      setDozing(false)
    }
    const check = window.setInterval(() => setDozing(Date.now() - lastActive.current >= DOZE_MS), 1000)
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearInterval(check)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  return dozing && !busy
}
