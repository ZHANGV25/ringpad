import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import type { EngineApi } from '../engine/api'
import type { Meters } from '../engine/types'
import { createStore, useStoreSelector, type Store } from '../lib/store'
import { selectEngineApi } from '../engine/select'
import { applyTheme } from '../theme'
import { engineReducer, initialEngineState, type EngineAction, type EngineState } from './reducer'
import { withReporting } from './reporting'

interface EngineContextValue {
  api: EngineApi
  state: EngineState
  dispatch: Dispatch<EngineAction>
}

/** Values that change many times a second. They never go through React state (see lib/store). */
export interface Signals {
  meters: Store<Meters>
  /** Peaks of the live history, oldest first. */
  live: Store<number[]>
}

interface Props {
  api?: EngineApi
  children: ReactNode
}

const NOTICE_MS = 4000

const EngineContext = createContext<EngineContextValue | null>(null)
const SILENT: Meters = { source: 0, mic: 0, outgoing: 0 }
const SignalsContext = createContext<Signals>({ meters: createStore(SILENT), live: createStore<number[]>([]) })

export function EngineProvider({ api: providedApi, children }: Props) {
  const [state, dispatch] = useReducer(engineReducer, initialEngineState)
  const signals = useMemo<Signals>(() => ({ meters: createStore(SILENT), live: createStore<number[]>([]) }), [])
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
    const notice = (message: string) => {
      const id = noticeIdRef.current++
      dispatch({ type: 'error', id, message })
      window.setTimeout(() => dispatch({ type: 'clearError', id }), NOTICE_MS)
    }
    const unsubscribers = [
      api.onStatus((status) => dispatch({ type: 'status', status })),
      api.onMeters((next) => signals.meters.set(next)),
      api.onLive(({ peaks }) => signals.live.set(peaks)),
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
    }
  }, [api, signals])

  const value = useMemo<EngineContextValue>(() => ({ api, state, dispatch }), [api, state])

  return (
    <EngineContext.Provider value={value}>
      <SignalsContext.Provider value={signals}>{children}</SignalsContext.Provider>
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

export function useSignals(): Signals {
  return useContext(SignalsContext)
}

/** A slow fact derived from the meters, such as "is anything playing". Return a primitive. */
export function useMeterSelector<S>(select: (meters: Meters) => S): S {
  return useStoreSelector(useSignals().meters, select)
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
