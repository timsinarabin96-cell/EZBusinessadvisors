'use client'

// =============================================================================
// RevenueChart — dependency-free SVG bar/line chart for the admin dashboard.
// Bars for one series (e.g. signups) + an optional overlay line for another
// (e.g. MRR in dollars). Pure SVG, no chart library.
// =============================================================================

export interface ChartPoint {
  label: string
  value: number
  line?: number
}

export default function RevenueChart({
  points,
  barColor = '#1a1a2e',
  lineColor = '#c9a84c',
  valueFormatter = (v) => String(v),
  height = 220,
}: {
  points: ChartPoint[]
  barColor?: string
  lineColor?: string
  valueFormatter?: (v: number) => string
  height?: number
}) {
  const W = 640
  const H = height
  const PAD = { top: 24, right: 16, bottom: 34, left: 48 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const maxVal = Math.max(1, ...points.map((p) => Math.max(p.value, p.line || 0)))
  const niceMax = niceCeil(maxVal)
  const slot = innerW / Math.max(1, points.length)
  const barW = Math.min(34, slot * 0.55)

  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH
  const x = (i: number) => PAD.left + slot * i + slot / 2

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PAD.top + innerH * (1 - f), label: Math.round(niceMax * f) }))

  const linePath =
    points.length > 1
      ? points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.line || 0).toFixed(1)}`)
          .join(' ')
      : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {/* Grid + y labels */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={g.y} y2={g.y} stroke="#f1f5f9" strokeWidth={1} />
          <text x={PAD.left - 8} y={g.y + 4} textAnchor="end" fontSize={10.5} fill="#94a3b8">
            {valueFormatter(g.label)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {points.map((p, i) => {
        const bh = (p.value / niceMax) * innerH
        return (
          <g key={i}>
            <rect x={x(i) - barW / 2} y={PAD.top + innerH - bh} width={barW} height={Math.max(0, bh)} rx={3} fill={barColor} opacity={0.88}>
              <title>{`${p.label}: ${valueFormatter(p.value)}`}</title>
            </rect>
            <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={10} fill="#64748b">
              {p.label}
            </text>
          </g>
        )
      })}

      {/* Overlay line */}
      {linePath && (
        <g>
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" />
          {points.map((p, i) =>
            p.line ? (
              <circle key={i} cx={x(i)} cy={y(p.line)} r={3.5} fill={lineColor}>
                <title>{`${p.label}: ${valueFormatter(p.line)}`}</title>
              </circle>
            ) : null
          )}
        </g>
      )}
    </svg>
  )
}

function niceCeil(v: number): number {
  if (v <= 10) return 10
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}
