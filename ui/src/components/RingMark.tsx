/** The Ringpad mark: a ring with a dot, drawn in the current text colour. */
export function RingMark() {
  return (
    <svg className="mark" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="11.5" r="6" />
      <circle className="dot" cx="16.6" cy="3.4" r="1.9" />
    </svg>
  )
}
