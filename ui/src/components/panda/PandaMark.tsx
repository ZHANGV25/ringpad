/** The Ringpad mark: the panda's head, small and still, in the current text colour. */
export function PandaMark({ className = 'mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.6" cy="6.2" r="3.4" fill="currentColor" />
      <circle cx="18.4" cy="6.2" r="3.4" fill="currentColor" />
      <ellipse cx="12" cy="13.4" rx="9.2" ry="8.4" fill="var(--bg)" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="8.5" cy="13.8" rx="2.3" ry="3" transform="rotate(34 8.5 13.8)" fill="currentColor" />
      <ellipse cx="15.5" cy="13.8" rx="2.3" ry="3" transform="rotate(-34 15.5 13.8)" fill="currentColor" />
      <circle cx="8.9" cy="13.2" r="0.95" fill="var(--bg)" />
      <circle cx="15.1" cy="13.2" r="0.95" fill="var(--bg)" />
      <ellipse cx="12" cy="17.3" rx="1.35" ry="0.95" fill="currentColor" />
    </svg>
  )
}
