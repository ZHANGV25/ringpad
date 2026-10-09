import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeApi } from './fakeApi'

afterEach(() => {
  vi.useRealTimers()
})

describe('fake engine', () => {
  it('refuses clip actions before there is a clip', async () => {
    const api = createFakeApi({ startTimers: false })
    await expect(api.previewClip()).rejects.toThrow('No clip yet')
    await expect(api.sendClip()).rejects.toThrow('No clip yet')
    await expect(api.saveClipToPad({ slot: 0 })).rejects.toThrow('No clip to save')
  })

  it('refuses pad actions on empty pads and non-https links', async () => {
    const api = createFakeApi({ startTimers: false })
    await expect(api.playPad({ slot: 3 })).rejects.toThrow('Pad is empty')
    await expect(api.renamePad({ slot: 3, name: 'x' })).rejects.toThrow('Pad is empty')
    await expect(api.openExternal({ url: 'http://example.com' })).rejects.toThrow('Only https links can be opened')
  })

  it('names imported pads from the file and falls back to the slot', async () => {
    const api = createFakeApi({ startTimers: false })
    expect((await api.importPad({ slot: 2, path: 'C:\\sounds\\airhorn.wav' })).name).toBe('airhorn')
    expect((await api.importPad({ slot: 3, path: '' })).name).toBe('Pad 4')
    expect((await api.renamePad({ slot: 2, name: '   ' })).name).toBe('Pad 3')
  })

  it('keeps saved settings and fills in devices', async () => {
    const api = createFakeApi({ startTimers: false, settings: { grabSeconds: 12, hotkeys: { grab: 'g' } as never } })
    const { settings } = await api.getSnapshot()
    expect(settings.grabSeconds).toBe(12)
    expect(settings.hotkeys).toMatchObject({ grab: 'g', send: 'f7' })
    expect(settings.virtualOutput).toBe('vb-output')
    expect(settings.firstRunDone).toBe(false)
    const patched = await api.updateSettings({ patch: { hotkeys: { ...settings.hotkeys, stop: null } } })
    expect(patched.hotkeys.stop).toBeNull()
  })

  it('only reports a captured key while capturing', async () => {
    const api = createFakeApi({ startTimers: false })
    const handler = vi.fn()
    api.onKeyCaptured(handler)
    api.simulateKey('a')
    await api.beginKeyCapture()
    api.simulateKey('b')
    api.simulateKey('c')
    expect(handler.mock.calls).toEqual([[{ key: 'b' }]])
  })

  it('animates meters and the live strip, and stops on dispose', async () => {
    vi.useFakeTimers()
    const api = createFakeApi({ settings: { micEnabled: true } })
    const meters = vi.fn()
    const live = vi.fn()
    const playback = vi.fn()
    api.onMeters(meters)
    api.onLive(live)
    api.onPlayback(playback)
    vi.advanceTimersByTime(100)
    expect(meters).toHaveBeenCalled()
    expect(live.mock.calls[0]?.[0].peaks).toHaveLength(300)

    await api.grabClip()
    await api.sendClip()
    vi.advanceTimersByTime(500)
    expect(playback.mock.lastCall?.[0]).toMatchObject({ sending: true, previewing: false })

    api.dispose()
    const count = meters.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(meters.mock.calls.length).toBe(count)
  })
})
