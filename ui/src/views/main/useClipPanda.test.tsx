import { act, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PadInfo } from '../../engine/types'
import { renderApp } from '../../test/render'
import { CELEBRATE_MS, DOZE_MS, HAPPY_MS, gainedSound, pickMood } from './useClipPanda'

const calm = {
  status: 'running' as const,
  error: false,
  sending: false,
  previewing: false,
  moment: null,
  hearing: false,
  dozing: false,
}

function pad(overrides: Partial<PadInfo> = {}): PadInfo {
  return { slot: 0, name: 'Pad', seconds: 2, volume: 1, hotkey: 'f1', peaks: [0.1, 0.5, 0.2], ...overrides }
}

function clipPanda(): string | undefined {
  return document.querySelector<SVGSVGElement>('svg.clip-panda')?.dataset.mood
}

describe('pickMood', () => {
  it('puts problems first, then talking, then moments, then what it hears', () => {
    expect(pickMood({ ...calm, status: 'needsSetup', sending: true })).toBe('confused')
    expect(pickMood({ ...calm, status: 'stopped' })).toBe('confused')
    expect(pickMood({ ...calm, error: true })).toBe('confused')
    expect(pickMood({ ...calm, sending: true, moment: 'happy' })).toBe('talking')
    expect(pickMood({ ...calm, moment: 'celebrate', hearing: true })).toBe('celebrate')
    expect(pickMood({ ...calm, status: 'starting' })).toBe('sleeping')
    expect(pickMood({ ...calm, previewing: true })).toBe('listening')
    expect(pickMood({ ...calm, hearing: true, dozing: true })).toBe('listening')
    expect(pickMood({ ...calm, dozing: true })).toBe('sleeping')
    expect(pickMood(calm)).toBe('idle')
  })
})

describe('gainedSound', () => {
  it('counts a new or replaced sound but not a rename, volume change or cleared pad', () => {
    expect(gainedSound([null], [pad()])).toBe(true)
    expect(gainedSound([pad()], [pad({ seconds: 3 })])).toBe(true)
    expect(gainedSound([pad()], [pad({ name: 'Renamed', volume: 0.5, hotkey: 'f2' })])).toBe(false)
    expect(gainedSound([pad()], [null])).toBe(false)
  })
})

describe('the clip card panda', () => {
  it('reacts to clips, saves, sending, problems and quiet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = await renderApp()
    // Let the panda's effects subscribe before anything happens.
    await act(async () => undefined)
    expect(clipPanda()).toBe('idle')

    await act(async () => {
      await api.grabClip()
    })
    expect(clipPanda()).toBe('happy')
    await act(async () => {
      await api.stopAll()
      vi.advanceTimersByTime(HAPPY_MS)
    })
    expect(clipPanda()).toBe('idle')

    await act(async () => {
      await api.saveClipToPad({ slot: 2 })
    })
    expect(clipPanda()).toBe('celebrate')
    act(() => {
      vi.advanceTimersByTime(CELEBRATE_MS)
    })
    expect(clipPanda()).not.toBe('celebrate')

    await act(async () => {
      await api.stopAll()
      await api.sendClip()
    })
    expect(clipPanda()).toBe('talking')
    await act(async () => {
      await api.stopAll()
    })

    act(() => api.simulateStatus({ kind: 'needsSetup', reason: 'No virtual cable found' }))
    expect(clipPanda()).toBe('confused')
    act(() => api.simulateStatus({ kind: 'running', sourceLabel: 'your headphones' }))

    act(() => {
      vi.advanceTimersByTime(DOZE_MS + 1000)
    })
    expect(clipPanda()).toBe('sleeping')
    act(() => {
      fireEvent.pointerMove(window)
    })
    expect(clipPanda()).toBe('idle')
  })
})
