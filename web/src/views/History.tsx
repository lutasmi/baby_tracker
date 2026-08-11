// Evolución por días de vida: lo que se acumula cada 24 h desde el nacimiento.
//
// Es lo que preocupa las primeras semanas —cuántos pises, cuántas cacas, cuánta
// leche— y solo tiene sentido leerlo por días de vida, no por días naturales:
// un bebé que nació a las nueve de la mañana no empieza el día a medianoche.

import { useEffect, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard, ScreenTitle, Seg } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { handleAuthError, navigate } from '../hooks'
import { nowMadrid, timeOf } from '../lib/dates'
import { formatGrams, formatKg, formatPercent, weightChange } from '../lib/records'
import type { History, HistoryDay, Settings, WeightRecord } from '../types'

export type Metric = 'pees' | 'poops' | 'milk' | 'weight'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'pees', label: '💧 Pises' },
  { value: 'poops', label: '💩 Cacas' },
  { value: 'milk', label: '🥛 Leche' },
  { value: 'weight', label: '⚖️ Peso' },
]

const DAYS = 14
const editRoute = (id: string) => `#/editar/${encodeURIComponent(id)}`

/** Qué métrica abrir según la ruta: #/evolucion/peso entra por el peso. */
export const METRIC_ROUTES: Record<string, Metric> = {
  pises: 'pees',
  cacas: 'poops',
  leche: 'milk',
  peso: 'weight',
}

export function HistoryView({ metric: initial }: { metric?: Metric } = {}) {
  const [history, setHistory] = useState<History | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [metric, setMetric] = useState<Metric>(initial ?? 'pees')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [data, day] = await Promise.all([
          getApi().getHistory(DAYS),
          // El peso al nacer es la referencia de la gráfica.
          getApi().getDay(nowMadrid().slice(0, 10)),
        ])
        if (!cancelled) {
          setHistory(data)
          setSettings(day.settings)
        }
      } catch (err) {
        if (!handleAuthError(err) && !cancelled) {
          setError(err instanceof ApiError ? err : new ApiError('INTERNAL', 'Error inesperado.'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <ScreenTitle title="Evolución" />
      <main class="app-main">
        <Seg<Metric> options={METRICS} value={metric} onChange={setMetric} />

        {!history && !error && (
          <div class="loading-screen">
            <div class="spinner" />
          </div>
        )}

        {error && <ErrorCard message={error.message} onRetry={() => location.reload()} />}

        {history && !history.birth && (
          <button class="card lifeday-empty" onClick={() => navigate('#/ajustes')}>
            <div>
              Añade la fecha y la hora de nacimiento para poder ver la evolución por días de vida.
            </div>
            <div class="lifeday-cta">Ir a ajustes ›</div>
          </button>
        )}

        {history?.birth && history.days.length === 0 && (
          <div class="empty-state">
            <span class="icon">📈</span>
            Todavía no hay días que comparar.
          </div>
        )}

        {history && history.days.length > 0 && (
          <>
            {metric === 'weight' ? (
              <>
                <div class="card">
                  <WeightChart
                    weights={history.weights}
                    birthWeightG={settings?.birthWeightG ?? 0}
                    today={nowMadrid().slice(0, 10)}
                  />
                </div>
                <div class="card">
                  <WeightList weights={history.weights} birthWeightG={settings?.birthWeightG ?? 0} />
                </div>
              </>
            ) : (
              <div class="card">
                <BarList days={history.days} metric={metric} />
              </div>
            )}
            <p class="field-hint">
              Cada día de vida son 24 h desde la hora de nacimiento. El de arriba está en curso, así
              que su cifra todavía no está completa.
            </p>
          </>
        )}
      </main>
    </>
  )
}

function valueOf(day: HistoryDay, metric: Metric): number {
  if (metric === 'pees') return day.totals.pees
  if (metric === 'poops') return day.totals.poops
  return day.totals.milkMl
}

function formatValue(value: number, metric: Metric): string {
  return metric === 'milk' ? `${value} ml` : String(value)
}

export function BarList({ days, metric }: { days: HistoryDay[]; metric: Metric }) {
  const max = Math.max(1, ...days.map((d) => valueOf(d, metric)))
  return (
    <div class="hist-list">
      {days.map((day, index) => {
        const value = valueOf(day, metric)
        return (
          <div class="hist-row" key={day.number}>
            <div class="hist-day">
              <span class="hist-number">Día {day.number}</span>
              {index === 0 && <span class="hist-current">en curso</span>}
            </div>
            <div class="hist-track">
              <div
                class={index === 0 ? 'hist-bar hist-bar-current' : 'hist-bar'}
                style={`width:${(value / max) * 100}%`}
              />
            </div>
            <div class="hist-value">{formatValue(value, metric)}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Las pesadas, de la más reciente a la más antigua, con lo que cambió. */
export function WeightList({
  weights,
  birthWeightG,
}: {
  weights: WeightRecord[]
  birthWeightG: number
}) {
  if (weights.length === 0) return <p class="field-hint">Todavía no hay pesadas.</p>

  const chronological = [...weights].sort((a, b) => (a.start < b.start ? -1 : 1))
  return (
    <div class="hist-list">
      {[...chronological].reverse().map((w, index) => {
        const previous = chronological[chronological.length - 2 - index]
        const change = weightChange(w.grams, birthWeightG)
        return (
          <button class="hist-row hist-row-link" key={w.id} onClick={() => navigate(editRoute(w.id))}>
            <div class="hist-day">
              <span class="hist-number">{w.start.slice(8, 10)}/{w.start.slice(5, 7)}</span>
              <span class="hist-current">{timeOf(w.start)}</span>
            </div>
            <div class="hist-weight">
              <strong>{formatKg(w.grams)}</strong>
              {previous && <span class="hist-delta">{formatGrams(w.grams - previous.grams)}</span>}
              {change && (
                <span class={change.diffG >= 0 ? 'chart-up' : 'chart-down'}>
                  {formatPercent(change.percent)}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
