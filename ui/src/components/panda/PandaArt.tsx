import { memo } from 'react'

/**
 * The panda's drawing. Every moving part is its own group (pd-*) so styles/panda.css
 * and motion.ts can animate it; each expression is a layer the mood shows or hides.
 */
export const PandaArt = memo(function PandaArt() {
  return (
    <>
      <ellipse className="pd-shadow" cx="100" cy="216" rx="50" ry="5.5" fill="var(--p-shadow)" />
      <g className="pd-root">
        <g fill="var(--p-black)">
          <ellipse cx="74" cy="204" rx="21" ry="14" />
          <ellipse cx="126" cy="204" rx="21" ry="14" />
        </g>
        <g className="pd-body">
          <path
            fill="var(--p-white)"
            stroke="var(--p-line)"
            strokeWidth="3.2"
            d="M100 126 C136 126 155 150 155 178 C155 203 132 212 100 212 C68 212 45 203 45 178 C45 150 64 126 100 126 Z"
          />
          <ellipse cx="100" cy="143" rx="40" ry="9" fill="var(--p-shade)" />
          <ellipse cx="100" cy="186" rx="27" ry="19" fill="var(--p-shade)" opacity=".55" />
        </g>
        <g className="pd-arm-l">
          <path d="M62 150 C58 160 62 172 74 178" stroke="var(--p-black)" strokeWidth="23" strokeLinecap="round" fill="none" />
        </g>
        <g className="pd-arm-r">
          <path d="M138 150 C142 160 138 172 126 178" stroke="var(--p-black)" strokeWidth="23" strokeLinecap="round" fill="none" />
        </g>
        <g className="pd-head">
          <g className="pd-ear-l">
            <circle cx="50" cy="45" r="22" fill="var(--p-black)" />
          </g>
          <g className="pd-ear-r">
            <circle cx="150" cy="45" r="22" fill="var(--p-black)" />
          </g>
          <path
            fill="var(--p-white)"
            stroke="var(--p-line)"
            strokeWidth="3.2"
            d="M100 28 C140 28 168 53 168 89 C168 124 139 148 100 148 C61 148 32 124 32 89 C32 53 60 28 100 28 Z"
          />
          <ellipse cx="72" cy="94" rx="18" ry="23" transform="rotate(34 72 94)" fill="var(--p-ink)" />
          <ellipse cx="128" cy="94" rx="18" ry="23" transform="rotate(-34 128 94)" fill="var(--p-ink)" />
          <PandaFace />
        </g>
        <PandaEffects />
      </g>
    </>
  )
})

function PandaFace() {
  return (
    <g className="pd-face">
      <g className="pd-eyes-open">
        <PandaEye cx={76} pupil={77.5} />
        <PandaEye cx={124} pupil={122.5} />
      </g>
      <g className="pd-eyes-happy" fill="none" stroke="var(--p-white)" strokeWidth="4.4" strokeLinecap="round">
        <path d="M66 93 Q76 81 86 93" />
        <path d="M114 93 Q124 81 134 93" />
      </g>
      <g className="pd-eyes-closed" fill="none" stroke="var(--p-white)" strokeWidth="4" strokeLinecap="round">
        <path d="M66 90 Q76 99 86 90" />
        <path d="M114 90 Q124 99 134 90" />
      </g>
      <path className="pd-brow" d="M112 66 L138 61" stroke="var(--p-ink)" strokeWidth="5" strokeLinecap="round" />
      <path
        fill="var(--p-ink)"
        d="M91.5 110 C95 106.8 105 106.8 108.5 110 C108 115.4 103.2 118.4 100 118.9 C96.8 118.4 92 115.4 91.5 110 Z"
      />
      <g className="pd-mouth-closed" fill="none" stroke="var(--p-ink)" strokeWidth="3.2" strokeLinecap="round">
        <path d="M100 118.9 V122.5" />
        <path d="M91.5 121.5 C94.5 126.5 100 126 100 122.5 C100 126 105.5 126.5 108.5 121.5" />
      </g>
      <g className="pd-mouth-open">
        <path
          fill="var(--p-ink)"
          d="M89.5 121 C93 118.8 107 118.8 110.5 121 C111.5 131 106.5 138.5 100 138.5 C93.5 138.5 88.5 131 89.5 121 Z"
        />
        <ellipse cx="100" cy="134" rx="6.5" ry="3.6" fill="var(--p-tongue)" />
      </g>
    </g>
  )
}

interface PandaEyeProps {
  cx: number
  pupil: number
}

function PandaEye({ cx, pupil }: PandaEyeProps) {
  return (
    <g className="pd-eye">
      <circle cx={cx} cy="89" r="11" fill="var(--p-white)" />
      <g className="pd-look">
        <g className="pd-pupil">
          <circle cx={pupil} cy="90" r="6.6" fill="var(--p-ink)" />
          <circle cx={pupil + 2.7} cy="87.2" r="2.5" fill="var(--p-white)" />
        </g>
      </g>
    </g>
  )
}

function PandaEffects() {
  return (
    <>
      <g className="pd-fx pd-fx-listen" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
        <path d="M176 64 Q181 72 176 80" />
        <path d="M184 58 Q192 72 184 86" />
        <path d="M192 52 Q203 72 192 92" />
      </g>
      <g className="pd-fx pd-fx-talk" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
        <path d="M176 104 Q181 112 176 120" />
        <path d="M184 98 Q192 112 184 126" />
        <path d="M192 92 Q203 112 192 132" />
      </g>
      <g className="pd-fx pd-fx-sleep" fill="currentColor" fontWeight="800" fontSize="18">
        <text x="150" y="40">z</text>
        <text x="150" y="40">z</text>
        <text x="150" y="40">z</text>
      </g>
      <g className="pd-fx pd-fx-ask">
        <text x="160" y="42" fontSize="34" fontWeight="800" fill="currentColor">
          ?
        </text>
      </g>
      <g className="pd-fx pd-fx-spark" fill="currentColor">
        <path d="M22 40 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z" />
        <path d="M176 30 l2.4 7 7 2.4 -7 2.4 -2.4 7 -2.4 -7 -7 -2.4 7 -2.4 z" />
        <path d="M182 120 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" />
      </g>
    </>
  )
}
