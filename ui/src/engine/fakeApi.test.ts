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

  it('adds VB-CABLE once when it installs, and can decline or fail', async () => {
    const api = createFakeApi({ startTimers: false, devices: [] })
    const devices = vi.fn()
    api.onDevices(devices)
    api.nextCableInstall = 'declined'
    expect(await api.installVirtualMic()).toBe('declined')
    expect(devices).not.toHaveBeenCalled()

    api.nextCableInstall = 'installed'
    expect(await api.installVirtualMic()).toBe('installed')
    expect(await api.installVirtualMic()).toBe('installed')
    expect(devices).toHaveBeenCalledOnce()
    expect((await api.listDevices()).map((device) => device.name)).toEqual([
      'CABLE Input (VB-Audio Virtual Cable)',
      'CABLE Output (VB-Audio Virtual Cable)',
    ])

    api.nextCableInstall = new Error('no admin')
    await expect(api.installVirtualMic()).rejects.toThrow('no admin')
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

  it('tracks talk key state for push-to-talk and toggle modes', async () => {
    const api = createFakeApi({ startTimers: false, settings: { micMode: 'pushToTalk', hotkeys: { talk: 't' } as never } })
    const talk = vi.fn()
    api.onTalk(talk)
    expect((await api.getSnapshot()).talk.micOpen).toBe(false)

    api.simulateKeyDown('t')
    expect(talk.mock.lastCall?.[0]).toMatchObject({ micOpen: true })
    api.simulateKeyUp('t')
    expect(talk.mock.lastCall?.[0]).toMatchObject({ micOpen: false })

    await api.updateSettings({ patch: { micMode: 'toggle' } })
    api.simulateKey('t')
    expect(talk.mock.lastCall?.[0]).toMatchObject({ micOpen: true })
    api.simulateKey('t')
    expect(talk.mock.lastCall?.[0]).toMatchObject({ micOpen: false })
  })

  it('holds game talk keys for tests, clips and pads', async () => {
    vi.useFakeTimers()
    const api = createFakeApi({ startTimers: false, settings: { pressTalkKeys: 'clips', gameTalkKeys: ['v', 'b'] } })
    const talk = vi.fn()
    api.onTalk(talk)
    await api.testTalkKeys()
    expect(talk.mock.lastCall?.[0].holding).toEqual(['v', 'b'])
    vi.advanceTimersByTime(2000)
    expect(talk.mock.lastCall?.[0].holding).toEqual([])

    const clip = await api.grabClip()
    await api.sendClip()
    expect(talk.mock.lastCall?.[0].holding).toEqual(['v', 'b'])
    // Held for as long as the clip plays, then for the tail.
    vi.advanceTimersByTime(clip.seconds * 1000)
    expect(talk.mock.lastCall?.[0].holding).toEqual(['v', 'b'])
    vi.advanceTimersByTime(250)
    expect(talk.mock.lastCall?.[0].holding).toEqual([])
  })

  it('validates talk settings and reports conflicts', async () => {
    const api = createFakeApi({ startTimers: false })
    await expect(api.updateSettings({ patch: { talkLeadMs: -1 } })).rejects.toThrow('Head start must be between 0 and 500 ms.')
    await expect(api.updateSettings({ patch: { talkTailMs: 2501 } })).rejects.toThrow('Release delay must be between 0 and 2000 ms.')
    await expect(api.updateSettings({ patch: { gameTalkKeys: [] } })).rejects.toThrow('Choose 1 to 3 game keys.')
    await expect(api.updateSettings({ patch: { gameTalkKeys: ['v', 'v'] } })).rejects.toThrow('Game keys must be unique.')
    await expect(api.updateSettings({ patch: { hotkeys: { ...(await api.getSnapshot()).settings.hotkeys, talk: 'f8' } } })).rejects.toThrow(
      'F8 is used by Clip.',
    )
    await expect(api.updateSettings({ patch: { gameTalkKeys: ['f9'] } })).rejects.toThrow('F9 is used by Stop.')
    const settings = (await api.getSnapshot()).settings
    await expect(api.updateSettings({ patch: { hotkeys: { ...settings.hotkeys, talk: 'v' } } })).resolves.toMatchObject({
      hotkeys: { talk: 'v' },
    })
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
