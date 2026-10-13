import type { EngineApi } from '../engine/api'
import type { DeviceInfo } from '../engine/types'

type Report = (message: string) => void
type OnDevices = (devices: DeviceInfo[]) => void

/**
 * Wraps every command so a failure shows a notice instead of disappearing.
 * A failed command reports its message and its promise never settles, so
 * follow-up steps (closing a menu, finishing setup) do not run after an error.
 * Listing devices also refreshes the device list in state.
 */
export function withReporting(api: EngineApi, report: Report, onDevices: OnDevices): EngineApi {
  const guard = <T>(run: () => Promise<T>): Promise<T> =>
    run().catch((error: unknown) => {
      report(error instanceof Error ? error.message : String(error))
      return new Promise<T>(() => undefined)
    })
  // Delegate explicitly: the fake api is a class, so spreading it would drop its methods.
  return {
    onStatus: (handler) => api.onStatus(handler),
    onMeters: (handler) => api.onMeters(handler),
    onLive: (handler) => api.onLive(handler),
    onClip: (handler) => api.onClip(handler),
    onPads: (handler) => api.onPads(handler),
    onPlayback: (handler) => api.onPlayback(handler),
    onDevices: (handler) => api.onDevices(handler),
    onSettings: (handler) => api.onSettings(handler),
    onKeyCaptured: (handler) => api.onKeyCaptured(handler),
    onError: (handler) => api.onError(handler),
    onTalk: (handler) => api.onTalk(handler),
    onFileDrop: (handler) => api.onFileDrop(handler),
    dispose: () => api.dispose?.(),
    getSnapshot: () => guard(() => api.getSnapshot()),
    listDevices: () =>
      guard(() =>
        api.listDevices().then((devices) => {
          onDevices(devices)
          return devices
        }),
      ),
    listAudioApps: () => guard(() => api.listAudioApps()),
    updateSettings: (args) => guard(() => api.updateSettings(args)),
    grabClip: () => guard(() => api.grabClip()),
    previewClip: () => guard(() => api.previewClip()),
    sendClip: () => guard(() => api.sendClip()),
    stopAll: () => guard(() => api.stopAll()),
    saveClipToPad: (args) => guard(() => api.saveClipToPad(args)),
    playPad: (args) => guard(() => api.playPad(args)),
    importPad: (args) => guard(() => api.importPad(args)),
    pickSoundFile: () => guard(() => api.pickSoundFile()),
    renamePad: (args) => guard(() => api.renamePad(args)),
    setPadVolume: (args) => guard(() => api.setPadVolume(args)),
    setPadHotkey: (args) => guard(() => api.setPadHotkey(args)),
    clearPad: (args) => guard(() => api.clearPad(args)),
    beginKeyCapture: () => guard(() => api.beginKeyCapture()),
    cancelKeyCapture: () => guard(() => api.cancelKeyCapture()),
    playTestTone: () => guard(() => api.playTestTone()),
    openExternal: (args) => guard(() => api.openExternal(args)),
    openClipsFolder: () => guard(() => api.openClipsFolder()),
    testTalkKeys: () => guard(() => api.testTalkKeys()),
    // Polled quietly: a failed check just means nothing is listening yet.
    micUsers: () => api.micUsers().catch(() => []),
    // Not guarded: the install button shows its own failure and must leave its busy state.
    installVirtualMic: () => api.installVirtualMic(),
  }
}
