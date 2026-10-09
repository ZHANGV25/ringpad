import type { EngineStatus } from '../../engine/types'
import { IconButton } from '../../components/controls'
import { GearIcon } from '../../components/icons'
import { RingMark } from '../../components/RingMark'

interface TopBarProps {
  status: EngineStatus
  onSettings: () => void
}

export function TopBar({ status, onSettings }: TopBarProps) {
  const needsFix = status.kind === 'needsSetup' || status.kind === 'stopped'
  return (
    <header className="topbar">
      <div className="brand">
        <RingMark />
        <span className="title">Ringpad</span>
      </div>
      <div className="status-line" role="status">
        <span className={`status-dot ${status.kind === 'running' ? 'on' : ''}`} aria-hidden="true" />
        <span className="status-text">{statusText(status)}</span>
        {needsFix ? (
          <button type="button" className="link-button" onClick={onSettings}>
            Fix
          </button>
        ) : null}
      </div>
      <IconButton label="Settings" onClick={onSettings}>
        <GearIcon />
      </IconButton>
    </header>
  )
}

export function statusText(status: EngineStatus): string {
  if (status.kind === 'running') return `Listening to ${status.sourceLabel}`
  if (status.kind === 'starting') return 'Starting'
  return status.reason
}
