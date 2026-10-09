import { useEffect, useRef, useState } from 'react'
import { KeyChip, Segmented, Slider } from '../components/controls'
import type { AudioApp, MicMode, PressTalkKeys, Settings, SettingsPatch, TalkState } from '../engine/types'
import type { Unsubscribe } from '../engine/api'
import { keyLabel } from '../keys'
import { useEngine } from '../state/EngineProvider'
import { HotkeyRow } from './SettingsHotkeys'

const MIC_OPTIONS: readonly MicMode[] = ['open', 'pushToTalk', 'toggle']
const MIC_LABELS: Record<MicMode, string> = {
  open: 'Always on',
  pushToTalk: 'Hold a key',
  toggle: 'Press to toggle',
}

const PRESS_OPTIONS: readonly PressTalkKeys[] = ['off', 'clips', 'clipsAndMic']
const PRESS_LABELS: Record<PressTalkKeys, string> = {
  off: 'Off',
  clips: 'While a clip plays',
  clipsAndMic: 'Clips and my mic',
}

interface TalkTabProps {
  settings: Settings
  talk: TalkState
}

export function TalkTab({ settings, talk }: TalkTabProps) {
  const { api } = useEngine()
  const [apps, setApps] = useState<AudioApp[]>([])
  const update = (patch: SettingsPatch) => void api.updateSettings({ patch })

  useEffect(() => {
    void api.listAudioApps().then((items) => setApps(uniqueApps(items)))
  }, [api])

  const listedApps = withCurrentApp(apps, settings.talkOnlyApp)
  const holding = talk.holding.map(keyLabel).join(' + ')
  return (
    <>
      <section className="group">
        <span className="label">Your mic</span>
        <Segmented label="Your mic" options={MIC_OPTIONS} value={settings.micMode} labels={MIC_LABELS} onChange={(micMode) => update({ micMode })} />
        {settings.micMode !== 'open' ? (
          <>
            <HotkeyRow label="Talk key" target={{ kind: 'main', key: 'talk' }} value={settings.hotkeys.talk} />
            {settings.hotkeys.talk === null ? <span className="hint">Pick a talk key. Until then your mic stays off.</span> : null}
            <span className="hint">Clips always play. Set Discord or your game to voice activity on the Ringpad cable.</span>
          </>
        ) : null}
      </section>
      <section className="group">
        <span className="label">Press my game's talk key</span>
        <span className="hint">
          For games where voice chat only works while a key is held, like Valorant team chat. Ringpad holds the game's key for you.
        </span>
        <Segmented
          label="Press the key"
          options={PRESS_OPTIONS}
          value={settings.pressTalkKeys}
          labels={PRESS_LABELS}
          onChange={(pressTalkKeys) => update({ pressTalkKeys })}
        />
        {settings.pressTalkKeys === 'clipsAndMic' && settings.micMode === 'toggle' ? (
          <span className="hint">Your talk key then works as a toggle for the game too.</span>
        ) : null}
        {settings.pressTalkKeys === 'clipsAndMic' && settings.micMode === 'open' ? (
          <span className="hint">Choose Hold a key or Press to toggle above for your mic to count.</span>
        ) : null}
        {settings.pressTalkKeys !== 'off' ? (
          <>
            <GameKeys settings={settings} />
            <div>
              <Slider label="Head start" value={settings.talkLeadMs} min={0} max={500} step={10} suffix=" ms" onChange={(talkLeadMs) => update({ talkLeadMs })} />
              <span className="hint">Presses the key this long before a clip so the first word is not cut.</span>
            </div>
            <Slider label="Release delay" value={settings.talkTailMs} min={0} max={2000} step={50} suffix=" ms" onChange={(talkTailMs) => update({ talkTailMs })} />
            <label className="slider-row">
              <span>Only when this app is in front</span>
              <select
                aria-label="Only when this app is in front"
                value={settings.talkOnlyApp ?? ''}
                onChange={(event) => update({ talkOnlyApp: event.currentTarget.value || null })}
              >
                <option value="">Any app</option>
                {listedApps.map((app) => (
                  <option key={app.exe} value={app.exe}>
                    {app.name}
                  </option>
                ))}
              </select>
              <span />
            </label>
            <div className="inline-control talk-test-row">
              <button type="button" className="button small" onClick={() => void api.testTalkKeys()}>
                Test
              </button>
              {holding ? <span className="hint">Holding {holding}</span> : null}
            </div>
            {talk.blocked ? (
              <span className="inline-error" role="alert">
                {talk.blocked}
              </span>
            ) : null}
            <span className="hint">Ringpad uses a normal Windows key press. No driver, nothing touches the game. Off unless you turn it on.</span>
          </>
        ) : null}
      </section>
    </>
  )
}

interface GameKeysProps {
  settings: Settings
}

function GameKeys({ settings }: GameKeysProps) {
  const { api } = useEngine()
  const [capturing, setCapturing] = useState(false)
  const latest = useRef(settings)
  useEffect(() => {
    latest.current = settings
  })
  useEffect(() => {
    if (!capturing) return undefined
    let captured = false
    const off = once(
      api.onKeyCaptured(({ key }) => {
        captured = true
        off()
        setCapturing(false)
        if (key === 'escape') return
        const current = latest.current
        void api.updateSettings({ patch: { gameTalkKeys: [...current.gameTalkKeys, key] } })
      }),
    )
    void api.beginKeyCapture()
    return () => {
      off()
      if (!captured) void api.cancelKeyCapture()
    }
  }, [api, capturing])

  const remove = (key: string) => {
    if (settings.gameTalkKeys.length === 1) return
    void api.updateSettings({ patch: { gameTalkKeys: settings.gameTalkKeys.filter((item) => item !== key) } })
  }

  return (
    <div className="field">
      <span>Game keys</span>
      <div className="talk-key-list">
        {settings.gameTalkKeys.map((key) => {
          const label = keyLabel(key)
          return (
            <span className="talk-key-item" key={key}>
              <KeyChip name={key} />
              <button
                type="button"
                className="button small ghost"
                aria-label={`Remove ${label}`}
                disabled={settings.gameTalkKeys.length === 1}
                onClick={() => remove(key)}
              >
                Remove
              </button>
            </span>
          )
        })}
        {settings.gameTalkKeys.length < 3 ? (
          <button type="button" className="button small" onClick={() => setCapturing(true)}>
            {capturing ? 'Press a key' : 'Add key'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function once(unsubscribe: Unsubscribe): Unsubscribe {
  let done = false
  return () => {
    if (done) return
    done = true
    unsubscribe()
  }
}

function uniqueApps(apps: AudioApp[]): AudioApp[] {
  return apps.filter((app, index) => apps.findIndex((item) => item.exe === app.exe) === index)
}

function withCurrentApp(apps: AudioApp[], talkOnlyApp: string | null): AudioApp[] {
  if (!talkOnlyApp || apps.some((app) => app.exe === talkOnlyApp)) return apps
  return [...apps, { pid: 0, exe: talkOnlyApp, name: talkOnlyApp, active: false, peak: 0 }]
}
