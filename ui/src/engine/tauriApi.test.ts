import { beforeEach, describe, expect, it, vi } from 'vitest'

type Callback = (event: { payload: unknown }) => void

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]) => 'ok' as unknown),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
  dragHandler: null as null | ((event: { payload: unknown }) => void),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: Callback) => {
    tauri.listeners.set(name, callback)
    return tauri.unlisten
  }),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (callback: Callback) => {
      tauri.dragHandler = callback
      return tauri.unlisten
    },
  }),
}))

const { tauriApi } = await import('./tauriApi')
const { selectEngineApi } = await import('./select')
const { normalizeAsyncUnlisten } = await import('./api')

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  tauri.invoke.mockClear()
  tauri.unlisten.mockClear()
  tauri.listeners.clear()
})

describe('tauri api', () => {
  it('maps every command to its IPC name and arguments', async () => {
    const calls: Array<[() => Promise<unknown>, string, unknown?]> = [
      [() => tauriApi.getSnapshot(), 'get_snapshot'],
      [() => tauriApi.listDevices(), 'list_devices'],
      [() => tauriApi.listAudioApps(), 'list_audio_apps'],
      [() => tauriApi.updateSettings({ patch: { grabSeconds: 3 } }), 'update_settings', { patch: { grabSeconds: 3 } }],
      [() => tauriApi.grabClip(), 'grab_clip'],
      [() => tauriApi.previewClip(), 'preview_clip'],
      [() => tauriApi.sendClip(), 'send_clip'],
      [() => tauriApi.stopAll(), 'stop_all'],
      [() => tauriApi.saveClipToPad({ slot: 1 }), 'save_clip_to_pad', { slot: 1 }],
      [() => tauriApi.playPad({ slot: 2 }), 'play_pad', { slot: 2 }],
      [() => tauriApi.importPad({ slot: 0, path: 'a.wav' }), 'import_pad', { slot: 0, path: 'a.wav' }],
      [() => tauriApi.renamePad({ slot: 0, name: 'A' }), 'rename_pad', { slot: 0, name: 'A' }],
      [() => tauriApi.setPadVolume({ slot: 0, volume: 0.5 }), 'set_pad_volume', { slot: 0, volume: 0.5 }],
      [() => tauriApi.setPadHotkey({ slot: 0, hotkey: null }), 'set_pad_hotkey', { slot: 0, hotkey: null }],
      [() => tauriApi.clearPad({ slot: 0 }), 'clear_pad', { slot: 0 }],
      [() => tauriApi.beginKeyCapture(), 'begin_key_capture'],
      [() => tauriApi.cancelKeyCapture(), 'cancel_key_capture'],
      [() => tauriApi.playTestTone(), 'play_test_tone'],
      [() => tauriApi.openExternal({ url: 'https://x.dev' }), 'open_external', { url: 'https://x.dev' }],
      [() => tauriApi.openClipsFolder(), 'open_clips_folder'],
    ]
    for (const [run, name, args] of calls) {
      await run()
      expect(tauri.invoke).toHaveBeenLastCalledWith(name, args)
    }
    expect(tauri.invoke).toHaveBeenCalledTimes(calls.length)
  })

  it('subscribes to every event and passes the payload', async () => {
    const handler = vi.fn()
    const subscriptions = {
      status: tauriApi.onStatus,
      meters: tauriApi.onMeters,
      live: tauriApi.onLive,
      clip: tauriApi.onClip,
      pads: tauriApi.onPads,
      playback: tauriApi.onPlayback,
      devices: tauriApi.onDevices,
      settings: tauriApi.onSettings,
      'key-captured': tauriApi.onKeyCaptured,
      error: tauriApi.onError,
    }
    const offs = Object.values(subscriptions).map((subscribe) => subscribe(handler))
    await flush()
    for (const name of Object.keys(subscriptions)) {
      tauri.listeners.get(name)?.({ payload: name })
      expect(handler).toHaveBeenLastCalledWith(name)
    }
    offs.forEach((off) => off())
    expect(tauri.unlisten).toHaveBeenCalledTimes(offs.length)
  })

  it('turns webview drag events into file drop events', async () => {
    const handler = vi.fn()
    const off = tauriApi.onFileDrop(handler)
    await flush()
    const position = { x: 4, y: 8 }
    const send = (payload: unknown) => tauri.dragHandler?.({ payload })
    send({ type: 'enter', paths: ['a.wav'], position })
    send({ type: 'over', position })
    send({ type: 'drop', paths: ['a.wav'], position })
    send({ type: 'leave' })
    send({ type: 'unknown' })
    expect(handler.mock.calls.map(([event]) => event)).toEqual([
      { type: 'enter', paths: ['a.wav'], position },
      { type: 'over', position },
      { type: 'drop', paths: ['a.wav'], position },
      { type: 'leave' },
      { type: 'leave' },
    ])
    off()
    expect(tauri.unlisten).toHaveBeenCalledOnce()
  })
})

describe('normalizeAsyncUnlisten', () => {
  it('unlistens once the listener resolves, even if unsubscribed first', async () => {
    const unlisten = vi.fn()
    const off = normalizeAsyncUnlisten(Promise.resolve(unlisten))
    off()
    await flush()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('ignores a listener that failed to register', async () => {
    const off = normalizeAsyncUnlisten(Promise.reject(new Error('no ipc')))
    await flush()
    expect(() => off()).not.toThrow()
  })
})

describe('selectEngineApi', () => {
  it('uses Tauri inside the app and the fake in a browser', () => {
    window.__TAURI_INTERNALS__ = {}
    expect(selectEngineApi()).toBe(tauriApi)
    delete window.__TAURI_INTERNALS__
    const fake = selectEngineApi()
    expect(fake).not.toBe(tauriApi)
    fake.dispose?.()
  })
})
