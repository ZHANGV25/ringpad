import { memo } from 'react'
import type { ReactNode } from 'react'

/**
 * The panda rig. Every moving part is an HTML layer holding a small static SVG, because the
 * compositor can move HTML layers without touching the main thread, while animated parts inside
 * one SVG get restyled, laid out and repainted on every frame the page draws for any reason.
 *
 * Coordinates are rig units: the panda is 200 wide and 224 tall. Each part is drawn in rig
 * coordinates and placed by its bounding box, so the paths read the same as one big drawing.
 * Wrapper names say which channel moves them (see styles/panda.css):
 *   pose   - where the mood holds the part; CSS transitions, so changes glide and can be interrupted
 *   loop   - the mood's ambient loop; CSS keyframes
 *   settle - a short spring that hides the jump when the loop changes (motion.ts)
 *   act    - one-shot moves such as a hop or a nod (motion.ts)
 */
export const PandaArt = memo(function PandaArt() {
  return (
    <>
      <L c="sh-pose">
        <L c="sh-act">
          <Art box={[48, 209, 104, 14]}>
            <ellipse cx="100" cy="216" rx="50" ry="5.5" fill="var(--p-shadow)" />
          </Art>
        </L>
      </L>
      <Chain names={['rt-pose', 'rt-mood', 'rt-settle', 'rt-loop', 'rt-act']}>
              <Art box={[51, 188, 98, 32]}>
                <g fill="var(--p-black)">
                  <ellipse cx="74" cy="204" rx="21" ry="14" />
                  <ellipse cx="126" cy="204" rx="21" ry="14" />
                </g>
              </Art>
              <Chain names={['bd-mood', 'bd-settle', 'bd-loop']}>
                <Art box={[42, 123, 116, 92]}>
                  <path
                    fill="var(--p-white)"
                    stroke="var(--p-line)"
                    strokeWidth="3.2"
                    d="M100 126 C136 126 155 150 155 178 C155 203 132 212 100 212 C68 212 45 203 45 178 C45 150 64 126 100 126 Z"
                  />
                  <ellipse cx="100" cy="143" rx="40" ry="9" fill="var(--p-shade)" />
                  <ellipse cx="100" cy="186" rx="27" ry="19" fill="var(--p-shade)" opacity=".55" />
                </Art>
              </Chain>
              <Arm side="l" d="M62 150 C58 160 62 172 74 178" box={[45, 138, 42, 52]} />
              <Arm side="r" d="M138 150 C142 160 138 172 126 178" box={[113, 138, 42, 52]} />
              <Head />
              <PandaEffects />
      </Chain>
    </>
  )
})

type Box = [number, number, number, number]

/** A full-rig wrapper layer. Children position themselves in rig units. */
function L({ c, children }: { c: string; children: ReactNode }) {
  return <div className={`pl ${c}`}>{children}</div>
}

/** Wrappers nested outermost first, one per motion channel. */
function Chain({ names, children }: { names: string[]; children: ReactNode }) {
  return names.reduceRight<ReactNode>((inner, name) => <L c={name}>{inner}</L>, children)
}

/** A static drawing placed at its bounding box (x, y, width, height in rig units). */
function Art({ box, children }: { box: Box; children: ReactNode }) {
  const [x, y, w, h] = box
  return (
    <svg
      className="pa"
      viewBox={`${x} ${y} ${w} ${h}`}
      style={{ ['--x' as string]: x, ['--y' as string]: y, ['--w' as string]: w, ['--h' as string]: h }}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function Arm({ side, d, box }: { side: 'l' | 'r'; d: string; box: Box }) {
  return (
    <Chain names={[`a${side}-pose`, `a${side}-mood`, `a${side}-settle`, `a${side}-act`]}>
      <Art box={box}>
        <path d={d} stroke="var(--p-black)" strokeWidth="23" strokeLinecap="round" fill="none" />
      </Art>
    </Chain>
  )
}

function Head() {
  return (
    <Chain names={['hd-pose', 'hd-mood', 'hd-settle', 'hd-loop', 'hd-look', 'hd-act', 'hd-talk']}>
              <Ear side="l" cx={50} />
              <Ear side="r" cx={150} />
              <Art box={[29, 25, 142, 126]}>
                <path
                  fill="var(--p-white)"
                  stroke="var(--p-line)"
                  strokeWidth="3.2"
                  d="M100 28 C140 28 168 53 168 89 C168 124 139 148 100 148 C61 148 32 124 32 89 C32 53 60 28 100 28 Z"
                />
                <ellipse cx="72" cy="94" rx="18" ry="23" transform="rotate(34 72 94)" fill="var(--p-ink)" />
                <ellipse cx="128" cy="94" rx="18" ry="23" transform="rotate(-34 128 94)" fill="var(--p-ink)" />
                <path
                  fill="var(--p-ink)"
                  d="M91.5 110 C95 106.8 105 106.8 108.5 110 C108 115.4 103.2 118.4 100 118.9 C96.8 118.4 92 115.4 91.5 110 Z"
                />
              </Art>
              <PandaFace />
              <HeadEffects />
    </Chain>
  )
}

function Ear({ side, cx }: { side: 'l' | 'r'; cx: number }) {
  return (
    <Chain names={[`e${side}-pose`, `e${side}-act`]}>
      <Art box={[cx - 23, 22, 46, 46]}>
        <circle cx={cx} cy="45" r="22" fill="var(--p-black)" />
      </Art>
    </Chain>
  )
}

function PandaFace() {
  return (
    <>
      <L c="x-eyes-open">
        <Eye side="l" cx={76} pupil={77.5} />
        <Eye side="r" cx={124} pupil={122.5} />
      </L>
      <L c="x-eyes-happy">
        <Art box={[62, 78, 76, 18]}>
          <g fill="none" stroke="var(--p-white)" strokeWidth="4.4" strokeLinecap="round">
            <path d="M66 93 Q76 81 86 93" />
            <path d="M114 93 Q124 81 134 93" />
          </g>
        </Art>
      </L>
      <L c="x-eyes-closed">
        <Art box={[62, 86, 76, 16]}>
          <g fill="none" stroke="var(--p-white)" strokeWidth="4" strokeLinecap="round">
            <path d="M66 90 Q76 99 86 90" />
            <path d="M114 90 Q124 99 134 90" />
          </g>
        </Art>
      </L>
      <L c="x-brow">
        <Art box={[108, 57, 34, 13]}>
          <path d="M112 66 L138 61" stroke="var(--p-ink)" strokeWidth="5" strokeLinecap="round" />
        </Art>
      </L>
      <L c="x-mouth-closed">
        <Art box={[89, 116, 22, 13]}>
          <g fill="none" stroke="var(--p-ink)" strokeWidth="3.2" strokeLinecap="round">
            <path d="M100 118.9 V122.5" />
            <path d="M91.5 121.5 C94.5 126.5 100 126 100 122.5 C100 126 105.5 126.5 108.5 121.5" />
          </g>
        </Art>
      </L>
      <L c="x-mouth-open">
        <L c="mo-talk">
          <Art box={[87, 117, 26, 24]}>
            <path
              fill="var(--p-ink)"
              d="M89.5 121 C93 118.8 107 118.8 110.5 121 C111.5 131 106.5 138.5 100 138.5 C93.5 138.5 88.5 131 89.5 121 Z"
            />
            <ellipse cx="100" cy="134" rx="6.5" ry="3.6" fill="var(--p-tongue)" />
          </Art>
        </L>
      </L>
    </>
  )
}

function Eye({ side, cx, pupil }: { side: 'l' | 'r'; cx: number; pupil: number }) {
  return (
    <Chain names={[`y${side}-pose`, `y${side}-blink`]}>
      <Art box={[cx - 12, 77, 24, 24]}>
        <circle cx={cx} cy="89" r="11" fill="var(--p-white)" />
      </Art>
      <Chain names={['look-pose', 'look-act', 'look']}>
        <Art box={[pupil - 7, 83, 15, 15]}>
          <circle cx={pupil} cy="90" r="6.6" fill="var(--p-ink)" />
          <circle cx={pupil + 2.7} cy="87.2" r="2.5" fill="var(--p-white)" />
        </Art>
      </Chain>
    </Chain>
  )
}

const WAVE = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.4, strokeLinecap: 'round' as const }

/**
 * Three arcs beside the head, starting at x: sound coming into the ear (listening) or out of the
 * mouth (talking). They ride on the head, so they stay put when it tilts, and their motion stays
 * inside the 200-unit box, so nothing next to the panda covers them.
 */
function Waves({ name, x, y }: { name: string; x: number; y: number }) {
  const arcs: Array<{ d: string; box: Box }> = [
    { d: `M${x} ${y + 12} Q${x + 5} ${y + 20} ${x} ${y + 28}`, box: [x - 4, y + 9, 12, 22] },
    { d: `M${x + 8} ${y + 6} Q${x + 16} ${y + 20} ${x + 8} ${y + 34}`, box: [x + 4, y + 3, 14, 34] },
    { d: `M${x + 16} ${y} Q${x + 27} ${y + 20} ${x + 16} ${y + 40}`, box: [x + 12, y - 3, 17, 46] },
  ]
  return (
    <L c={`fx ${name}`}>
      {arcs.map((arc, i) => (
        <L key={arc.d} c={`w w${i + 1}`}>
          <Art box={arc.box}>
            <path d={arc.d} {...WAVE} />
          </Art>
        </L>
      ))}
    </L>
  )
}

const SPARKS: Array<{ d: string; box: Box }> = [
  { d: 'M22 40 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z', box: [9, 39, 26, 26] },
  { d: 'M176 30 l2.4 7 7 2.4 -7 2.4 -2.4 7 -2.4 -7 -7 -2.4 7 -2.4 z', box: [166, 29, 21, 21] },
  { d: 'M182 120 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z', box: [173, 119, 18, 18] },
]

/** Sound at the ear and mouth, riding on the head. */
function HeadEffects() {
  return (
    <>
      <Waves name="fx-listen" x={170} y={50} />
      <Waves name="fx-talk" x={164} y={112} />
    </>
  )
}

/** Effects that stay put while the head moves: the head tilts away from the question mark. */
function PandaEffects() {
  return (
    <>
      <L c="fx fx-sleep">
        {[1, 2, 3].map((i) => (
          <L key={i} c={`z z${i}`}>
            <Art box={[146, 22, 16, 20]}>
              <text x="149" y="40" fill="currentColor" fontWeight="800" fontSize="18">
                z
              </text>
            </Art>
          </L>
        ))}
      </L>
      <L c="fx fx-ask">
        <L c="ask-bob">
          <Art box={[156, 10, 30, 38]}>
            <text x="160" y="42" fontSize="34" fontWeight="800" fill="currentColor">
              ?
            </text>
          </Art>
        </L>
      </L>
      <L c="fx fx-spark">
        {SPARKS.map((spark, i) => (
          <L key={spark.d} c={`s s${i + 1}`}>
            <Art box={spark.box}>
              <path d={spark.d} fill="currentColor" />
            </Art>
          </L>
        ))}
      </L>
    </>
  )
}
