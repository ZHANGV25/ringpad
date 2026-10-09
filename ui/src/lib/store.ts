import { useCallback, useSyncExternalStore } from 'react'

/**
 * A value that changes many times a second (meters, the live waveform). Readers that draw every
 * frame call get() or subscribe(); React only re-renders through useStoreSelector, and only when
 * the selected value changes, so 30 updates a second do not re-render the app.
 */
export interface Store<T> {
  get(): T
  set(value: T): void
  subscribe(listener: (value: T) => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    get: () => value,
    set(next) {
      value = next
      listeners.forEach((listener) => listener(next))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Re-renders only when `select` returns something different (compare with Object.is). */
export function useStoreSelector<T, S>(store: Store<T>, select: (value: T) => S): S {
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store])
  return useSyncExternalStore(subscribe, () => select(store.get()), () => select(store.get()))
}
