import { formatKg, formatPercent, weightChange } from '../lib/records'
import type { HistoryDay } from '../types'

const W = 320
const H = 130
const PAD_L = 46
const PAD_R = 10
const PAD_T = 12
const PAD_B = 22

/**
 * Evolución del peso en el tiempo, con la referencia del peso al nacer.
 *
 * La escala vertical **no empieza en cero**: con pesos de recién nacido, una
 * escala desde cero dejaría la línea plana y no se vería nada. A cambio, la
 * referencia del nacimiento está siempre dibujada, que es contra lo que de
 * verdad se compara.
 */
export function WeightChart({
  days,
  birthWeightG,
}: {
  days: HistoryDay[]
  birthWeightG: number
}) {
  // Del más antiguo al más reciente, solo los días con pesada.
  const points = [...days]
    .reverse()
    .filter((d) => d.weightG != null)
    .map((d) => ({ number: d.number, grams: d.weightG as number }))

  if (points.length === 0) {
    return <p class="field-hint">Todavía no hay pesadas que dibujar.</p>
  }

  const values = points.map((p) => p.grams)
  if (birthWeightG > 0) values.push(birthWeightG)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const margin = Math.max(40, (rawMax - rawMin) * 0.2)
  const min = rawMin - margin
  const max = rawMax + margin

  const firstDay = points[0].number
  const lastDay = points[points.length - 1].number
  const spanX = Math.max(1, lastDay - firstDay)

  const x = (number: number) => PAD_L + ((number - firstDay) / spanX) * (W - PAD_L - PAD_R)
  const y = (grams: number) => PAD_T + (1 - (grams - min) / (max - min)) * (H - PAD_T - PAD_B)

  const line = points.map((p) => `${x(p.number)},${y(p.grams)}`).join(' ')
  const last = points[points.length - 1]
  const change = weightChange(last.grams, birthWeightG)

  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} class="chart-svg" role="img" aria-label="Evolución del peso">
        {/* Referencia: el peso al nacer, que es contra lo que se compara. */}
        {birthWeightG > 0 && (
          <>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(birthWeightG)}
              y2={y(birthWeightG)}
              class="chart-birth"
            />
            <text x={PAD_L - 6} y={y(birthWeightG) + 4} class="chart-axis-label" text-anchor="end">
              {(birthWeightG / 1000).toFixed(2).replace('.', ',')}
            </text>
          </>
        )}

        <text x={PAD_L - 6} y={y(rawMax) + 4} class="chart-axis-label" text-anchor="end">
          {(rawMax / 1000).toFixed(2).replace('.', ',')}
        </text>
        {rawMin !== rawMax && (
          <text x={PAD_L - 6} y={y(rawMin) + 4} class="chart-axis-label" text-anchor="end">
            {(rawMin / 1000).toFixed(2).replace('.', ',')}
          </text>
        )}

        {points.length > 1 && <polyline points={line} class="chart-line" />}
        {points.map((p) => (
          <circle key={p.number} cx={x(p.number)} cy={y(p.grams)} r="4" class="chart-point" />
        ))}

        <text x={PAD_L} y={H - 6} class="chart-axis-label">
          Día {firstDay}
        </text>
        {lastDay !== firstDay && (
          <text x={W - PAD_R} y={H - 6} class="chart-axis-label" text-anchor="end">
            Día {lastDay}
          </text>
        )}
      </svg>

      <div class="chart-caption">
        <strong>{formatKg(last.grams)}</strong>
        {change && (
          <span>
            {formatPercent(change.percent)} desde el nacimiento
          </span>
        )}
      </div>
      <p class="field-hint">La escala vertical no empieza en cero: compara con la línea de puntos.</p>
    </div>
  )
}
