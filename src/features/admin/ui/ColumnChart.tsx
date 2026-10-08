import { niceMax } from '../service/chart-scale'

type ColumnChartProps = {
  title: string
  data: Array<{ label: string; value: number }>
  formatValue: (value: number) => string
  formatAxis?: (value: number) => string
  labelEvery?: number
  emptyMessage: string
}

const WIDTH = 640
const HEIGHT = 220
const PLOT = { top: 14, right: 12, bottom: 30, left: 96 }

// O último rótulo sempre aparece; o regular anterior some se ficar colado nele.
function showLabel(index: number, length: number, every: number) {
  const last = length - 1
  if (index === last) return true
  return index % every === 0 && last - index >= every / 2
}

// Série temporal em colunas. O SVG é decorativo; a tabela oculta entrega os dados ao leitor de tela.
export function ColumnChart({
  title,
  data,
  formatValue,
  formatAxis = formatValue,
  labelEvery = 1,
  emptyMessage,
}: ColumnChartProps) {
  if (data.every((point) => point.value === 0)) {
    return <p className="admin-chart__empty">{emptyMessage}</p>
  }
  const max = niceMax(Math.max(0, ...data.map((point) => point.value)))
  const plotWidth = WIDTH - PLOT.left - PLOT.right
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom
  const slot = plotWidth / Math.max(1, data.length)
  const barWidth = Math.max(2, slot * 0.68)
  const ticks = [0, max / 2, max]

  return (
    <figure className="admin-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" focusable="false">
        {ticks.map((tick) => {
          const y = PLOT.top + plotHeight - (tick / max) * plotHeight
          return (
            <g key={tick}>
              <line
                className="admin-chart__grid"
                x1={PLOT.left}
                x2={WIDTH - PLOT.right}
                y1={y}
                y2={y}
              />
              <text className="admin-chart__axis" x={PLOT.left - 8} y={y + 4} textAnchor="end">
                {formatAxis(tick)}
              </text>
            </g>
          )
        })}
        {data.map((point, index) => {
          const height = (point.value / max) * plotHeight
          const x = PLOT.left + index * slot + (slot - barWidth) / 2
          return (
            <g key={point.label}>
              <rect
                className="admin-chart__bar"
                x={x}
                y={PLOT.top + plotHeight - height}
                width={barWidth}
                height={Math.max(height, point.value > 0 ? 1 : 0)}
                rx={2}
              >
                <title>{`${point.label}: ${formatValue(point.value)}`}</title>
              </rect>
              {showLabel(index, data.length, labelEvery) ? (
                <text
                  className="admin-chart__axis"
                  x={index === data.length - 1 ? x + barWidth : x + barWidth / 2}
                  y={HEIGHT - 6}
                  textAnchor={index === data.length - 1 ? 'end' : 'middle'}
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
