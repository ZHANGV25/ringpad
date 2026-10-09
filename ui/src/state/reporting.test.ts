import { describe, expect, it, vi } from 'vitest'
import { createFakeApi } from '../engine/fakeApi'
import { withReporting } from './reporting'

function setup() {
  const fake = createFakeApi({ startTimers: false })
  const report = vi.fn()
  const onDevices = vi.fn()
  return { fake, report, onDevices, api: withReporting(fake, report, onDevices) }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('withReporting', () => {
  it('passes results through', async () => {
    const { api, report } = setup()
    expect((await api.getSnapshot()).backend).toBe('fake')
    expect(await api.listAudioApps()).toHaveLength(3)
    await api.updateSettings({ patch: { grabSeconds: 9 } })
    expect((await api.getSnapshot()).settings.grabSeconds).toBe(9)
    expect(report).not.toHaveBeenCalled()
  })

  it('reports a failure and never settles', async () => {
    const { api, report } = setup()
    const after = vi.fn()
    void api.sendClip().then(after, after)
    await settle()
    expect(report).toHaveBeenCalledWith('No clip yet')
    expect(after).not.toHaveBeenCalled()
  })

  it('reports values that are not errors as text', async () => {
    const { api, fake, report } = setup()
    vi.spyOn(fake, 'stopAll').mockRejectedValue(404)
    void api.stopAll()
    await settle()
    expect(report).toHaveBeenCalledWith('404')
  })

  it('updates the device list whenever devices are listed', async () => {
    const { api, onDevices } = setup()
    const devices = await api.listDevices()
    expect(onDevices).toHaveBeenCalledWith(devices)
  })

  it('forwards every command to the engine', async () => {
    const { api, fake, report } = setup()
    await api.grabClip()
    await api.previewClip()
    await api.saveClipToPad({ slot: 0 })
    await api.playPad({ slot: 0 })
    await api.importPad({ slot: 1, path: 'C:\\a.wav' })
    await api.renamePad({ slot: 1, name: 'A' })
    await api.setPadVolume({ slot: 1, volume: 0.5 })
    await api.setPadHotkey({ slot: 1, hotkey: 'k' })
    await api.clearPad({ slot: 1 })
    await api.beginKeyCapture()
    await api.cancelKeyCapture()
    await api.playTestTone()
    await api.openExternal({ url: 'https://example.com' })
    await api.openClipsFolder()
    await api.testTalkKeys()
    expect(report).not.toHaveBeenCalled()
    expect(fake.lastPad()).toBe(0)
    expect(fake.openedUrl).toBe('https://example.com')
    expect(fake.clipsFolderOpened).toBe(true)
    fake.dispose()
  })

  it('forwards every event subscription and dispose', () => {
    const { api, fake } = setup()
    const handler = vi.fn()
    const offs = [
      api.onStatus(handler),
      api.onMeters(handler),
      api.onLive(handler),
      api.onClip(handler),
      api.onPads(handler),
      api.onPlayback(handler),
      api.onDevices(handler),
      api.onSettings(handler),
      api.onKeyCaptured(handler),
      api.onError(handler),
      api.onTalk(handler),
      api.onFileDrop(handler),
    ]
    fake.emitError('x')
    fake.simulateTalkBlocked('blocked')
    fake.emitFileDrop({ type: 'leave' })
    fake.simulateStatus({ kind: 'starting' })
    expect(handler).toHaveBeenCalledTimes(4)
    offs.forEach((off) => off())
    fake.emitError('y')
    expect(handler).toHaveBeenCalledTimes(4)
    const dispose = vi.spyOn(fake, 'dispose')
    api.dispose?.()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
