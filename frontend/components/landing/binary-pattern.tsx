/**
 * Decorative binary texture behind the hero (DESIGN.md).
 * Rows are generated deterministically so server and client markup match.
 */
const ROWS = 14
const COLUMNS = 90

function buildRow(rowIndex: number) {
  let row = ""
  for (let column = 0; column < COLUMNS; column += 1) {
    row += (rowIndex * 7 + column * 3 + (column % 5)) % 3 === 0 ? "1" : "0"
  }
  return row
}

export function BinaryPattern() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom_right,transparent_10%,black_95%)] select-none"
    >
      <div className="flex flex-col font-mono text-[13px] leading-[1.9] tracking-[0.35em] whitespace-nowrap text-brand/20">
        {Array.from({ length: ROWS }, (_, rowIndex) => (
          <span key={rowIndex}>{buildRow(rowIndex)}</span>
        ))}
      </div>
    </div>
  )
}
