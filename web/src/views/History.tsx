// Evolución por días de vida: lo que se acumula cada 24 h desde el nacimiento.
//
// Es lo que preocupa las primeras semanas —cuántos pises, cuántas cacas, cuánta
// leche— y solo tiene sentido leerlo por días de vida, no por días naturales:
// un bebé que nació a las nueve de la mañana no empieza el día a medianoche.

import { useEffect, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard, ScreenTitle, Seg } from '../components/ui'
import { handleAuthError, navigate } from '../hooks'
import { formatGrams, formatKg } from '../lib/records'
import type { History, HistoryDay } from '../types'

export type Metric = 'pees' | 'poops' | 'milk' | 'weight'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'pees', label: '💧 Pises' },
  { value: 'poops', label: '💩 Cacas' },
  { value: 'milk', label: '🥛 Leche' },
  { value: 'weight', label: '⚖️ Peso' },
]

const DAYS = 14

export function HistoryView() {
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [metric, setMetric] = useState<Metric>('pees')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await getApi().getHistory(DAYS)
        if (!cancelled) setHistory(data)
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
            <div class="card">
              {metric === 'weight' ? (
                <WeightList days={history.days} />
              ) : (
                <BarList days={history.days} metric={metric} />
              )}
            </div>
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

/**
 * El peso no se dibuja con barras: como no empiezan en cero, la diferencia
 * entre 3,2 y 3,4 kg parecería enorme. Se muestra la cifra y lo que cambió
 * respecto a la pesada anterior.
 */
export function WeightList({ days }: { days: HistoryDay[] }) {
  // De más antiguo a más reciente para poder comparar con la pesada previa.
  const chronological = [...days].reverse()
  const deltas = new Map<number, number>()
  let previous: number | null = null
  for (const day of chronological) {
    if (day.weightG == null) continue
    if (previous != null) deltas.set(day.number, day.weightG - previous)
    previous = day.weightG
  }

  return (
    <div class="hist-list">
      {days.map((day, index) => (
        <div class="hist-row" key={day.number}>
          <div class="hist-day">
            <span class="hist-number">Día {day.number}</span>
            {index === 0 && <span class="hist-current">en curso</span>}
          </div>
          <div class="hist-weight">
            {day.weightG == null ? (
              <span class="hist-none">sin pesada</span>
            ) : (
              <>
                <strong>{formatKg(day.weightG)}</strong>
                {deltas.has(day.number) && (
                  <span class="hist-delta">{formatGrams(deltas.get(day.number)!)}</span>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
