import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, makeEmptyPads, type Snapshot } from '../engine/types'
import { engineReducer, initialEngineState } from './reducer'

function sampleSnapshot(): Snapshot {
  return {
    version: '1',
    backend: 'test',
    status: { kind: 'running', sourceLabel: 'Discord' },
    settings: { ...DEFAULT_SETTINGS, firstRunDone: true },
    devices: [],
    clip: null,
    pads: makeEmptyPads(),
    playback: { sending: false, previewing: false, saveArmed: false },
    virtualCaptureHint: null,
    talk: { micOpen: true, holding: [], blocked: null },
  }
}

describe('engineReducer', () => {
  it('loads a snapshot without mutating the previous state', () => {
    const previous = initialEngineState
    const snapshot = sampleSnapshot()
    const next = engineReducer(previous, { type: 'snapshot', snapshot })
    expect(previous.loaded).toBe(false)
    expect(next.loaded).toBe(true)
    expect(next.status).toEqual({ kind: 'running', sourceLabel: 'Discord' })
  })

  it('handles every event action immutably', () => {
    const loaded = engineReducer(initialEngineState, { type: 'snapshot', snapshot: sampleSnapshot() })
    const actions = [
      { type: 'status' as const, status: { kind: 'stopped' as const, reason: 'Paused' } },
      { type: 'settings' as const, settings: { ...DEFAULT_SETTINGS, theme: 'dark' as const } },
      { type: 'devices' as const, devices: [{ id: 'd', name: 'D', direction: 'output' as const, isDefault: true, virtualCable: null }] },
      { type: 'clip' as const, clip: { id: 'c', seconds: 2, peaks: [0.1], savedPath: null } },
      { type: 'pads' as const, pads: makeEmptyPads() },
      { type: 'playback' as const, playback: { sending: true, previewing: false, saveArmed: false } },
      { type: 'talk' as const, talk: { micOpen: false, holding: ['v'], blocked: null } },
      { type: 'error' as const, id: 1, message: 'Nope' },
    ]
    let state = loaded
    actions.forEach((action) => {
      const before = state
      state = engineReducer(state, action)
      expect(state).not.toBe(before)
    })
    const kept = engineReducer(state, { type: 'clearError', id: 2 })
    expect(kept.notice?.message).toBe('Nope')
    const cleared = engineReducer(state, { type: 'clearError', id: 1 })
    expect(cleared.notice).toBeNull()
  })
})
