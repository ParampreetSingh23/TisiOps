/**
 * Isometric line drawing of two stacked server units, used as the Servers
 * empty state. Coordinates come from a true isometric projection
 * (x' = (x-y)·cos30, y' = (x+y)·sin30 - z) of a 54×54×15 box.
 *
 * Each unit is drawn back-to-front with canvas-filled faces so the upper unit
 * cleanly occludes the lower one.
 */

type Unit = {
  top: string
  left: string
  right: string
  dots: [number, number][]
  vents: string[]
}

const LOWER: Unit = {
  top: "M62 51 L108.8 78 L62 105 L15.2 78 Z",
  left: "M15.2 78 L62 105 L62 120 L15.2 93 Z",
  right: "M62 105 L108.8 78 L108.8 93 L62 120 Z",
  dots: [
    [23.6, 90.4],
    [28.3, 93.1],
    [33, 95.8],
  ],
  vents: [
    "M70.4 106.6 L91 94.8",
    "M70.4 110.1 L91 98.3",
    "M70.4 113.6 L91 101.8",
  ],
}

const UPPER: Unit = {
  top: "M62 29 L108.8 56 L62 83 L15.2 56 Z",
  left: "M15.2 56 L62 83 L62 98 L15.2 71 Z",
  right: "M62 83 L108.8 56 L108.8 71 L62 98 Z",
  dots: [
    [23.6, 68.4],
    [28.3, 71.1],
    [33, 73.8],
  ],
  vents: ["M70.4 84.6 L91 72.8", "M70.4 88.1 L91 76.3", "M70.4 91.6 L91 79.8"],
}

function ServerUnit({ unit }: { unit: Unit }) {
  return (
    <g>
      <path d={unit.left} fill="var(--tisi-canvas)" />
      <path d={unit.right} fill="var(--tisi-canvas)" />
      <path d={unit.top} fill="var(--tisi-canvas)" />
      {unit.dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" strokeWidth="1.2" />
      ))}
      {unit.vents.map((vent) => (
        <path key={vent} d={vent} strokeWidth="1.2" />
      ))}
    </g>
  )
}

export function ServerStack({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="8 22 108 106"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <ServerUnit unit={LOWER} />
      <ServerUnit unit={UPPER} />
    </svg>
  )
}
