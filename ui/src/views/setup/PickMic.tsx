import { useEffect, useState } from 'react'
import type { MicUser, Settings } from '../../engine/types'
import { Segmented, Toggle } from '../../components/controls'
import { CheckIcon } from '../../components/icons'
import { keyLabel } from '../../keys'
import { useEngine } from '../../state/EngineProvider'

type Target = 'discord' | 'valorant' | 'other'

const TARGETS: readonly Target[] = ['discord', 'valorant', 'other']
const TARGET_NAMES: Record<Target, string> = { discord: 'Discord', valorant: 'Valorant', other: 'Other' }
/** Where the setting lives in each app. */
const PLACES: Record<Target, string> = {
  discord: 'Discord › Settings › Voice & Video',
  valorant: 'Valorant › Settings › Audio › Voice Chat',
  other: 'Your app › Settings › Voice or Audio',
}
/** Apps only open a mic while voice is on, so Ringpad can only check then. */
const HOW_TO_CHECK: Record<Target, string> = {
  discord: 'Join a voice channel so Ringpad can check.',
  valorant: 'Join a match or party so Ringpad can check.',
  other: 'Start a call so Ringpad can check.',
}
const TARGET_EXE: Record<Target, RegExp> = { discord: /^discord/i, valorant: /^valorant/i, other: /./ }
/** What Windows calls VB-CABLE's mic, for when the engine hasn't said yet. */
export const CABLE_MIC = 'CABLE Output (VB-Audio Virtual Cable)'
/** How often setup looks at which apps record from which mic. */
const LOOK_EVERY_MS = 1500

interface PickMicProps {
  settings: Settings
  users: MicUser[]
}

export function PickMicStep({ settings, users }: PickMicProps) {
  return (
    <>
      <h1>Use Ringpad’s mic</h1>
      <MicGuide settings={settings} users={users} talkKey />
    </>
  )
}

interface MicGuideProps extends PickMicProps {
  /** Setup offers to hold Valorant's talk key here; Settings has its own place for it. */
  talkKey?: boolean
}

/** Shows the one setting to change, drawn the way the app shows it, and checks it live. */
export function MicGuide({ settings, users, talkKey = false }: MicGuideProps) {
  const { state } = useEngine()
  const [target, setTarget] = useState<Target>(() => (recordsValorant(settings) ? 'valorant' : 'discord'))
  const mic = state.virtualCaptureHint ?? CABLE_MIC
  return (
    <>
      <Segmented label="Where you talk" options={TARGETS} value={target} labels={TARGET_NAMES} onChange={setTarget} />
      <figure className="mock" aria-label={`In ${PLACES[target]}`}>
        <figcaption className="mock-place">{PLACES[target]}</figcaption>
        <div className="mock-field">
          <span className="mock-label">Input device</span>
          <span className="mock-select">{mic}</span>
        </div>
        {target === 'discord' ? (
          // Both treat clips as background noise and cut them.
          <>
            <MockRow label="Noise suppression" value="None" />
            <MockRow label="Echo cancellation" value="Off" />
          </>
        ) : null}
      </figure>
      <Check users={users} target={target} mic={mic} />
      {settings.micEnabled ? <p className="hint">Your voice goes through it too.</p> : null}
      {talkKey && target === 'valorant' ? <TalkKeyToggle settings={settings} /> : null}
    </>
  )
}

function MockRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mock-row">
      <span className="mock-label">{label}</span>
      <span className="mock-value">{value}</span>
    </div>
  )
}

interface CheckProps {
  users: MicUser[]
  target: Target
  mic: string
}

/** The live answer: it works, it's on the wrong mic, or nothing is listening yet. */
function Check({ users, target, mic }: CheckProps) {
  const hearing = names(users.filter((user) => user.ringpad))
  if (hearing.length > 0) {
    return (
      <p className="check ok" role="status">
        <CheckIcon /> {joinNames(hearing)} can hear Ringpad
      </p>
    )
  }
  const elsewhere = users.find((user) => !user.ringpad && TARGET_EXE[target].test(user.exe))
  if (elsewhere) {
    return (
      <p className="check wrong" role="status">
        {elsewhere.name} is using <strong>{elsewhere.mic}</strong>. Pick <strong>{shortMic(mic)}</strong> instead.
      </p>
    )
  }
  const waitingFor = target === 'other' ? 'your app' : TARGET_NAMES[target]
  return (
    <p className="check waiting" role="status">
      <span className="check-dot" aria-hidden="true" />
      <span>
        Waiting for {waitingFor}… <span className="muted">{HOW_TO_CHECK[target]}</span>
      </span>
    </p>
  )
}

/** Valorant's executable, for holding its talk key only while it is in front. */
const VALORANT_EXE = 'VALORANT-Win64-Shipping.exe'

/**
 * Valorant's team chat only sends while the talk key is held; Ringpad can hold it during clips.
 * Turning it on here also limits the key to Valorant (unless Settings already picked an app),
 * so a V never lands in a chat box or a document.
 */
function TalkKeyToggle({ settings }: { settings: Settings }) {
  const { api } = useEngine()
  const keys = settings.gameTalkKeys.map(keyLabel).join(' + ')
  const turnOn = { pressTalkKeys: 'clips', talkOnlyApp: settings.talkOnlyApp ?? VALORANT_EXE } as const
  return (
    <Toggle
      checked={settings.pressTalkKeys !== 'off'}
      label={`Hold ${keys} for me while a clip plays`}
      hint="Team chat only sends while it’s held. Only while Valorant is in front."
      onChange={(on) => void api.updateSettings({ patch: on ? turnOn : { pressTalkKeys: 'off' } })}
    />
  )
}

/** Apps recording from a mic, looked up every so often while `on`. */
export function useMicUsers(on: boolean): MicUser[] {
  const { api } = useEngine()
  const [users, setUsers] = useState<MicUser[]>([])
  useEffect(() => {
    if (!on) return undefined
    let alive = true
    const look = () => {
      void api.micUsers().then((found) => {
        if (alive) setUsers((current) => (sameUsers(current, found) ? current : found))
      })
    }
    look()
    const timer = window.setInterval(look, LOOK_EVERY_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [api, on])
  return users
}

export function hearsRingpad(users: MicUser[]): boolean {
  return users.some((user) => user.ringpad)
}

function sameUsers(a: MicUser[], b: MicUser[]): boolean {
  return a.length === b.length && a.every((user, index) => user.pid === b[index]?.pid && user.mic === b[index]?.mic)
}

function names(users: MicUser[]): string[] {
  return [...new Set(users.map((user) => user.name))]
}

export function joinNames(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** "CABLE Output (VB-Audio Virtual Cable)" reads as "CABLE Output" in a sentence. */
function shortMic(mic: string): string {
  return mic.replace(/\s*\(.*\)$/, '')
}

function recordsValorant(settings: Settings): boolean {
  return settings.source.kind === 'app' && /valorant/i.test(settings.source.exe)
}
