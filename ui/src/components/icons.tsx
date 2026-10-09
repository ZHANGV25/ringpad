import type { ReactNode } from 'react'

interface IconProps {
  title?: string
}

function Icon({ title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" role={title ? 'img' : 'presentation'} aria-label={title}>
      {children}
    </svg>
  )
}

export function GearIcon(props: IconProps) {
  return <Icon {...props}><path d="M6.7 1.8h2.6l.4 1.7 1.4.6 1.5-.9 1.3 2.2-1.3 1.1v1.6l1.3 1.1-1.3 2.2-1.5-.9-1.4.6-.4 1.7H6.7l-.4-1.7-1.4-.6-1.5.9-1.3-2.2 1.3-1.1V6.5L2.1 5.4l1.3-2.2 1.5.9 1.4-.6.4-1.7Z" /><circle cx="8" cy="8" r="2" /></Icon>
}

export function BackIcon(props: IconProps) {
  return <Icon {...props}><path d="M10 3 5 8l5 5" /><path d="M5.5 8H14" /></Icon>
}

export function PlayIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 3.5v9l7-4.5-7-4.5Z" /></Icon>
}

export function StopIcon(props: IconProps) {
  return <Icon {...props}><path d="M4.5 4.5h7v7h-7z" /></Icon>
}

export function SendIcon(props: IconProps) {
  return <Icon {...props}><path d="M2.5 13.5 13.5 2.5" /><path d="M5 2.5h8.5V11" /></Icon>
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props}><path d="M8 3v10" /><path d="M3 8h10" /></Icon>
}

export function TrashIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 4.5h10" /><path d="M6 4.5v-2h4v2" /><path d="M5 6.5v7h6v-7" /></Icon>
}

export function RefreshIcon(props: IconProps) {
  return <Icon {...props}><path d="M13 6a5 5 0 0 0-8.6-2.7L3 4.7" /><path d="M3 2v2.7h2.7" /><path d="M3 10a5 5 0 0 0 8.6 2.7L13 11.3" /><path d="M13 14v-2.7h-2.7" /></Icon>
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m3 8.2 3.1 3.1L13 4.7" /></Icon>
}

export function WaveformIcon(props: IconProps) {
  return <Icon {...props}><path d="M2 8h2l1-4 2 8 2-6 1 2h4" /></Icon>
}

export function MicIcon(props: IconProps) {
  return <Icon {...props}><path d="M5.5 3.5a2.5 2.5 0 0 1 5 0v4a2.5 2.5 0 0 1-5 0z" /><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" /><path d="M8 12v2" /></Icon>
}

export function HeadphonesIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 8a5 5 0 0 1 10 0v4" /><path d="M3 9.5h2v4H3z" /><path d="M11 9.5h2v4h-2z" /></Icon>
}

export function ExternalLinkIcon(props: IconProps) {
  return <Icon {...props}><path d="M6 3H3.5v9.5h9.5V10" /><path d="M9 3h4v4" /><path d="m7.5 8.5 5-5" /></Icon>
}

export function MoreIcon(props: IconProps) {
  return <Icon {...props}><circle cx="4" cy="8" r=".8" /><circle cx="8" cy="8" r=".8" /><circle cx="12" cy="8" r=".8" /></Icon>
}
