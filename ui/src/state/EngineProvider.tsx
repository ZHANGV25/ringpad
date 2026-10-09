import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import type { EngineApi } from '../engine/api'
import type { Meters } from '../engine/types'
import { selectEngineApi } from '../engine/select'
import { applyTheme } from '../theme'
import { engineReducer, initialEngineState, type EngineAction, type EngineState } from './reducer'
import { withReporting } from './reporting'

interface EngineContextValue {
  api: EngineApi
  state: EngineState
  dispatch: Dispatch<EngineAction>
}

interface MeterContextValue {
  meters: Meters
}

interface Props {
  api?: EngineApi
  children: ReactNode
}

const NOTICE_MS = 4000

const EngineContext = createContext<EngineContextValue | null>(null)
const MeterContext = createContext<MeterContextValue>({ meters: { source: 0, mic: 0, outgoing: 0 } })

export function EngineProvider({ api: providedApi, children }: Props) {
  const [state, dispatch] = useReducer(engineReducer, initialEngineState)
  const meterRef = useRef<Meters>({ source: 0, mic: 0, outgoing: 0 })
  const [meters, setMeters] = useState<Meters>(meterRef.current)
  const rafRef = useRef<number | null>(null)
  const noticeIdRef = useRef(1)
  const api = useMemo(() => {
    const report = (message: string) => {
      const id = noticeIdRef.current++
      dispatch({ type: 'error', id, message })
      window.setTimeout(() => dispatch({ type: 'clearError', id }), NOTICE_MS)
    }
    return withReporting(providedApi ?? selectEngineApi(), report, (devices) => dispatch({ type: 'devices', devices }))
  }, [providedApi])

  useEffect(() => {
    let disposed = false
    api.getSnapshot().then((snapshot) => {
      if (!disposed) {
        dispatch({ type: 'snapshot', snapshot })
        applyTheme(snapshot.settings.theme)
      }
    }).catch((error: unknown) => {
      dispatch({ type: 'error', id: noticeIdRef.current++, message: messageFromError(error) })
    })
    // The api lives as long as the app; it is not disposed here because React's
    // StrictMode re-runs effects in development and would stop the fake's timers.
    return () => {
      disposed = true
    }
  }, [api])

  useEffect(() => {
    const scheduleMeters = () => {
      if (rafRef.current !== null) {
        return
      }
      if (typeof window.requestAnimationFrame === 'undefined') {
        setMeters(meterRef.current)
        return
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        setMeters(meterRef.current)
      })
    }
    const notice = (message: string) => {
      const id = noticeIdRef.current++
      dispatch({ type: 'error', id, message })
      window.setTimeout(() => dispatch({ type: 'clearError', id }), NOTICE_MS)
    }
    const unsubscribers = [
      api.onStatus((status) => dispatch({ type: 'status', status })),
      api.onMeters((next) => {
        meterRef.current = next
        scheduleMeters()
      }),
      api.onLive(({ peaks }) => dispatch({ type: 'live', peaks })),
      api.onClip((clip) => dispatch({ type: 'clip', clip })),
      api.onPads((pads) => dispatch({ type: 'pads', pads })),
      api.onPlayback((playback) => dispatch({ type: 'playback', playback })),
      api.onTalk((talk) => dispatch({ type: 'talk', talk })),
      api.onDevices((devices) => dispatch({ type: 'devices', devices })),
      api.onSettings((settings) => {
        dispatch({ type: 'settings', settings })
        applyTheme(settings.theme)
      }),
      api.onError(({ message }) => notice(message)),
    ]
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      if (rafRef.current !== null) {
        window.cancelAnimationFrame?.(rafRef.current)
      }
    }
  }, [api])

  const value = useMemo<EngineContextValue>(() => ({ api, state, dispatch }), [api, state])
  const meterValue = useMemo<MeterContextValue>(() => ({ meters }), [meters])

  return (
    <EngineContext.Provider value={value}>
      <MeterContext.Provider value={meterValue}>{children}</MeterContext.Provider>
    </EngineContext.Provider>
  )
}

export function useEngine(): EngineContextValue {
  const value = useContext(EngineContext)
  if (!value) {
    throw new Error('useEngine must be used inside EngineProvider')
  }
  return value
}

export function useMeters(): Meters {
  return useContext(MeterContext).meters
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
