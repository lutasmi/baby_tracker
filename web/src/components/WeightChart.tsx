import { diffMinutes, formatDateHuman } from '../lib/dates'
import { formatGrams, formatKg, formatPercent } from '../lib/records'
import type { WeightRecord } from '../types'

const W = 320
const H = 170
const PAD_L = 42
const PAD_R = 40
const PAD_T = 12
const PAD_B = 26

/**
 * Evolución del peso en el tiempo.
 *
 * El eje horizontal es tiempo real, así que dos pesadas seguidas se ven juntas
 * y un hueco de una semana se ve como un hueco. La línea va **verde por encima
 * del peso al nacer y roja por debajo**, y las barras miden esa misma
 * diferencia en porcentaje sobre el eje de la derecha.
 *
 * La escala vertical no empieza en cero: con pesos de recién nacido dejaría la
 * línea plana. La referencia del nacimiento está siempre dibujada, que es
 * contra lo que de verdad se compara.
 */
export function WeightChart({
  weights,
  birthWeightG,
  today,
}: {
  weights: WeightRecord[]
  birthWeightG: number
  today: string
}) {
  const points = [...weights].sort((a, b) => (a.start < b.start ? -1 : 1))

  if (points.length === 0) {
    return <p class="field-hint">Todavía no hay pesadas que dibujar.</p>
  }

  const values = points.map((p) => p.grams)
  if (birthWeightG > 0) values.push(birthWeightG)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const margin = Math.max(40, (rawMax - rawMin) * 0.25)
  const min = rawMin - margin
  const max = rawMax + margin

  // Eje horizontal: minutos reales desde la primera pesada.
  const first = points[0].start
  const spanMin = Math.max(1, diffMinutes(first, points[points.length - 1].start))
  const x = (dt: string) => PAD_L + (diffMinutes(first, dt) / spanMin) * (W - PAD_L - PAD_R)
  const y = (grams: number) => PAD_T + (1 - (grams - min) / (max - min)) * (H - PAD_T - PAD_B)

  const hasBirth = birthWeightG > 0
  const baseline = hasBirth ? y(birthWeightG) : y(rawMin)
  const line = points.map((p) => `${x(p.start)},${y(p.grams)}`).join(' ')
  const last = points[points.length - 1]
  const pctOf = (grams: number) => ((grams - birthWeightG) / birthWeightG) * 100

  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} class="chart-svg" role="img" aria-label="Evolución del peso">
        <defs>
          {/* La línea se pinta dos veces y cada mitad se recorta a su lado de
              la referencia: así el color cambia justo donde la cruza. */}
          <clipPath id="peso-encima">
            <rect x="0" y="0" width={W} height={baseline} />
          </clipPath>
          <clipPath id="peso-debajo">
            <rect x="0" y={baseline} width={W} height={H - baseline} />
          </clipPath>
        </defs>

        {/* Barras: la diferencia en porcentaje, sobre el eje de la derecha. */}
        {hasBirth &&
          points.map((p) => {
            const top = Math.min(baseline, y(p.grams))
            const height = Math.abs(y(p.grams) - baseline)
            return (
              <rect
                key={p.id}
                x={x(p.start) - 5}
                y={top}
                width="10"
                height={Math.max(1, height)}
                class={p.grams >= birthWeightG ? 'chart-bar-up' : 'chart-bar-down'}
              />
            )
          })}

        {hasBirth && (
          <line x1={PAD_L} x2={W - PAD_R} y1={baseline} y2={baseline} class="chart-birth" />
        )}

        {points.length > 1 && (
          <>
            <polyline points={line} class="chart-line chart-line-up" clip-path="url(#peso-encima)" />
            <polyline
              points={line}
              class="chart-line chart-line-down"
              clip-path="url(#peso-debajo)"
            />
          </>
        )}
        {points.map((p) => (
          <circle
            key={`${p.id}-punto`}
            cx={x(p.start)}
            cy={y(p.grams)}
            r="3.5"
            class={!hasBirth || p.grams >= birthWeightG ? 'chart-point-up' : 'chart-point-down'}
          />
        ))}

        {/* Eje izquierdo, en kilos. */}
        <text x={PAD_L - 6} y={y(rawMax) + 4} class="chart-axis-label" text-anchor="end">
          {(rawMax / 1000).toFixed(2).replace('.', ',')}
        </text>
        {rawMin !== rawMax && (
          <text x={PAD_L - 6} y={y(rawMin) + 4} class="chart-axis-label" text-anchor="end">
            {(rawMin / 1000).toFixed(2).replace('.', ',')}
          </text>
        )}

        {/* Eje derecho, en porcentaje respecto al nacimiento. */}
        {hasBirth && (
          <>
            <text x={W - PAD_R + 6} y={baseline + 4} class="chart-axis-label">
              0 %
            </text>
            <text x={W - PAD_R + 6} y={y(rawMax) + 4} class="chart-axis-label">
              {formatPercent(pctOf(rawMax))}
            </text>
            {rawMin !== rawMax && (
              <text x={W - PAD_R + 6} y={y(rawMin) + 4} class="chart-axis-label">
                {formatPercent(pctOf(rawMin))}
              </text>
            )}
          </>
        )}

        <text x={PAD_L} y={H - 8} class="chart-axis-label">
          {formatDateHuman(points[0].start.slice(0, 10), today)}
        </text>
        {points.length > 1 && (
          <text x={W - PAD_R} y={H - 8} class="chart-axis-label" text-anchor="end">
            {formatDateHuman(last.start.slice(0, 10), today)}
          </text>
        )}
      </svg>

      <div class="chart-caption">
        <strong>{formatKg(last.grams)}</strong>
        {hasBirth && (
          <span class={last.grams >= birthWeightG ? 'chart-up' : 'chart-down'}>
            {formatGrams(last.grams - birthWeightG)} · {formatPercent(pctOf(last.grams))} desde el
            nacimiento
          </span>
        )}
      </div>
      <p class="field-hint">
        Barras y eje derecho: diferencia en porcentaje respecto al peso al nacer. La escala de
        kilos no empieza en cero.
      </p>
    </div>
  )
}
