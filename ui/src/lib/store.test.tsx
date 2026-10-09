import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStore, useStoreSelector } from './store'
import type { Store } from './store'

describe('createStore', () => {
  it('hands each new value to its listeners until they unsubscribe', () => {
    const store = createStore(1)
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.set(2)
    expect(store.get()).toBe(2)
    expect(listener).toHaveBeenCalledWith(2)
    off()
    store.set(3)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.get()).toBe(3)
  })
})

describe('useStoreSelector', () => {
  function Probe({ store, renders }: { store: Store<{ level: number }>; renders: () => void }) {
    renders()
    const loud = useStoreSelector(store, (value) => value.level > 0.5)
    return <span>{loud ? 'loud' : 'quiet'}</span>
  }

  it('re-renders only when the selected value changes', () => {
    const store = createStore({ level: 0 })
    const renders = vi.fn()
    const view = render(<Probe store={store} renders={renders} />)
    expect(view.getByText('quiet')).toBeTruthy()
    const before = renders.mock.calls.length

    act(() => store.set({ level: 0.1 }))
    act(() => store.set({ level: 0.2 }))
    expect(renders.mock.calls.length).toBe(before)

    act(() => store.set({ level: 0.9 }))
    expect(view.getByText('loud')).toBeTruthy()
    expect(renders.mock.calls.length).toBe(before + 1)
  })
})
