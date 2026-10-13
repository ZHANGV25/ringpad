import { useCallback, useEffect, useState } from 'react'
import type { AudioApp, Settings } from '../engine/types'
import { IconButton, Toggle } from '../components/controls'
import { RefreshIcon } from '../components/icons'
import { useEngine } from '../state/EngineProvider'
import { NoCableCallout, SwitchToVbCable } from './CableInstall'

interface TabProps {
  settings: Settings
}

/** Choose what Ringpad records: the default output, one output device, or one app. */
export function SourcePicker({ settings }: TabProps) {
  const { api, state } = useEngine()
  const [apps, setApps] = useState<AudioApp[]>([])
  const loadApps = useCallback(() => {
    void api.listAudioApps().then((items) => setApps(sortApps(items)))
  }, [api])
  useEffect(loadApps, [loadApps])
  const outputs = state.devices.filter((device) => device.direction === 'output' && !device.virtualCable)
  const listed = withSavedApp(apps, settings.source)
  return (
    <>
      <div className="inline-control">
        <select
          aria-label="Record from"
          value={sourceToValue(settings.source)}
          onChange={(event) => void api.updateSettings({ patch: { source: valueToSource(event.currentTarget.value, listed) } })}
        >
          <option value="default">Everything I hear</option>
          <optgroup label="One app only">
            {listed.map((app) => (
              <option key={app.exe} value={`app:${app.exe}`}>
                {app.active ? '● ' : ''}
                {app.name}
                {app.pid === 0 ? ' (not running)' : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="An output device">
            {outputs.map((device) => (
              <option key={device.id} value={`device:${device.id}`}>
                {device.name}
              </option>
            ))}
          </optgroup>
        </select>
        <IconButton label="Refresh apps" onClick={loadApps}>
          <RefreshIcon />
        </IconButton>
      </div>
      <span className="hint">Pick the app your team talks in. ● means it’s playing sound now.</span>
      {settings.source.kind === 'device' ? (
        <Toggle
          checked={settings.relaySource}
          label="Play it in my headphones"
          hint="Turn on when voice chat goes to an output with nothing plugged in, like Realtek Digital Output."
          onChange={(relaySource) => void api.updateSettings({ patch: { relaySource } })}
        />
      ) : null}
    </>
  )
}

/** Choose the virtual cable clips are sent through, or install the one Ringpad ships with. */
export function VirtualMicPicker({ settings }: TabProps) {
  const { api, state } = useEngine()
  const cables = state.devices.filter((device) => device.direction === 'output' && device.virtualCable)
  if (cables.length === 0) {
    return <NoCableCallout />
  }
  return (
    <>
      <select
        aria-label="Virtual mic"
        value={settings.virtualOutput ?? ''}
        onChange={(event) => void api.updateSettings({ patch: { virtualOutput: event.currentTarget.value || null } })}
      >
        {cables.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
      {cables.some((device) => device.virtualCable === 'vbcable') ? null : <SwitchToVbCable />}
    </>
  )
}

function withSavedApp(apps: AudioApp[], source: Settings['source']): AudioApp[] {
  if (source.kind !== 'app' || apps.some((app) => app.exe === source.exe)) return apps
  return [...apps, { pid: 0, exe: source.exe, name: source.name, active: false, peak: 0 }]
}

export function sourceToValue(source: Settings['source']): string {
  if (source.kind === 'default') return 'default'
  if (source.kind === 'device') return `device:${source.id}`
  return `app:${source.exe}`
}

export function valueToSource(value: string, apps: AudioApp[]): Settings['source'] {
  if (value === 'default') return { kind: 'default' }
  if (value.startsWith('device:')) return { kind: 'device', id: value.slice('device:'.length) }
  const exe = value.slice('app:'.length)
  const app = apps.find((item) => item.exe === exe)
  return { kind: 'app', exe, name: app?.name ?? exe }
}

function sortApps(apps: AudioApp[]): AudioApp[] {
  return [...apps].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
}
