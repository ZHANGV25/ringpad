import { useCallback, useEffect, useState } from 'react'
import type { AudioApp, Meters, Settings, SettingsPatch } from '../engine/types'
import { IconButton, Slider, Toggle } from '../components/controls'
import { RefreshIcon } from '../components/icons'
import { LevelMeter } from '../components/LevelMeter'
import { useEngine } from '../state/EngineProvider'
import { NoCableCallout, SwitchToVbCable } from './CableInstall'

interface TabProps {
  settings: Settings
}

export function AudioTab({ settings }: TabProps) {
  const { api, state } = useEngine()
  const update = (patch: SettingsPatch) => void api.updateSettings({ patch })
  const outputs = state.devices.filter((device) => device.direction === 'output' && !device.virtualCable)
  const inputs = state.devices.filter((device) => device.direction === 'input' && !device.virtualCable)
  return (
    <>
      <section className="group">
        <span className="label">Record from</span>
        <SourcePicker settings={settings} />
      </section>
      <section className="group">
        <span className="label">Virtual mic</span>
        <VirtualMicPicker settings={settings} />
      </section>
      <section className="group">
        <span className="label">Your headphones</span>
        <select
          aria-label="Headphones"
          value={settings.headphones ?? ''}
          onChange={(event) => update({ headphones: event.currentTarget.value || null })}
        >
          <option value="">Same as Windows</option>
          {outputs.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
        <Slider label="You hear" value={settings.monitorVolume} min={0} max={1} step={0.01} percent onChange={(monitorVolume) => update({ monitorVolume })} />
      </section>
      <section className="group">
        <span className="label">Your mic</span>
        <Toggle checked={settings.micEnabled} label="Pass my mic through" hint="Teammates hear you and the clips on one mic." onChange={(micEnabled) => update({ micEnabled })} />
        <select
          aria-label="Mic device"
          disabled={!settings.micEnabled}
          value={settings.mic ?? ''}
          onChange={(event) => update({ mic: event.currentTarget.value || null })}
        >
          <option value="">Default mic</option>
          {inputs.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
        <Toggle checked={settings.ducking} label="Lower my mic while sending" hint="Stops your mic picking the clip up from your headphones." onChange={(ducking) => update({ ducking })} />
      </section>
      <section className="group">
        <span className="label">Levels and length</span>
        <Slider label="Clip volume" value={settings.sendVolume} min={0} max={1} step={0.01} percent onChange={(sendVolume) => update({ sendVolume })} />
        <Slider label="Keep the last" value={settings.historySeconds} min={10} max={120} step={5} suffix=" s" onChange={(historySeconds) => update({ historySeconds })} />
        <Slider label="Clip length" value={settings.grabSeconds} min={1} max={30} step={1} suffix=" s" onChange={(grabSeconds) => update({ grabSeconds })} />
      </section>
      <section className="group">
        <span className="label">Test</span>
        <div className="inline-control">
          <button type="button" className="button small" onClick={() => void api.playTestTone()}>
            Play a test sound
          </button>
        </div>
        <MeterRow />
      </section>
    </>
  )
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
          <option value="default">What I hear (default output)</option>
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
      <span className="hint">For the cleanest clips, pick the app your teammates talk in. Apps playing sound now have a ●.</span>
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
      <span className="hint">
        In your game or Discord, choose <strong>{state.virtualCaptureHint ?? 'the cable output'}</strong> as your microphone.
      </span>
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

const readSource = (meters: Meters) => meters.source
const readMic = (meters: Meters) => meters.mic
const readOut = (meters: Meters) => meters.outgoing

/** Every level in one place, for checking each step of the route. */
function MeterRow() {
  return (
    <div className="meter-rows">
      <span className="small muted">Recording</span>
      <LevelMeter label="Recording" read={readSource} />
      <span className="small muted">Your mic</span>
      <LevelMeter label="Your mic" read={readMic} />
      <span className="small muted">Teammates hear</span>
      <LevelMeter label="Teammates hear" read={readOut} />
    </div>
  )
}
