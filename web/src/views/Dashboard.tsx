import { useEffect, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { DayStrip } from '../components/DayStrip'
import { ErrorCard, Seg, StatTile } from '../components/ui'
import { handleAuthError, navigate, useDay, useDayMode, useDays, useNow } from '../hooks'
import {
  addDays,
  addMinutes,
  dateOf,
  diffMinutes,
  formatAgo,
  formatDateHuman,
  formatDuration,
  nowMadrid,
  timeOf,
} from '../lib/dates'
import { babyStatus, isStaleSleep } from '../lib/derive'
import { lifeDayRange, lifeDayTotals } from '../lib/lifeday'
import { windowRecords } from '../lib/timeline'
import { formatGrams, formatKg, formatPercent, weightChange } from '../lib/records'
import type { DayMode } from '../prefs'
import { showToast } from '../toast'
import type { BabyRecord, DayData, LifeDayTotals, SleepRecord, User } from '../types'

const editRoute = (id: string) => `#/editar/${encodeURIComponent(id)}`
const goEdit = (id: string) => navigate(editRoute(id))

/** El tramo que se está mirando: hoy, o uno anterior. */
interface Period {
  title: string
  subtitle: string
  start: string
  end: string
}

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const { data, loading, error, reload } = useDay(today)
  const [mode, setMode] = useDayMode()
  const [saving, setSaving] = useState(false)
  // 0 es el periodo en curso; 1, el anterior, y así hacia atrás.
  const [back, setBack] = useState(0)

  // Cambiar de calendario vuelve al periodo actual.
  useEffect(() => setBack(0), [mode])

  async function quickSleepAction(action: () => Promise<unknown>, okMessage: string) {
    setSaving(true)
    try {
      await action()
      showToast(okMessage)
      await reload()
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo guardar.', 'error')
        await reload() // por si otro usuario cambió el estado
      }
    } finally {
      setSaving(false)
    }
  }

  function endSleep(open: SleepRecord) {
    const end = nowMadrid()
    void quickSleepAction(
      () =>
        getApi().updateRecord({
          id: open.id,
          type: 'sleep',
          start: open.start,
          end,
          durationMin: diffMinutes(open.start, end),
          kind: open.kind,
          notes: open.notes,
        }),
      'Despertar registrado ☀️'
    )
  }

  const period = data ? periodOf(data, mode, back, today) : null
  const isCurrent = back === 0
  // Un tramo pasado casi siempre cae a caballo de dos días naturales.
  const { days: pastDays } = useDays(isCurrent || !period ? [] : datesOf(period))

  let records: BabyRecord[] = []
  if (data && period) {
    if (isCurrent) {
      records = mode === 'life' && data.lifeDay ? data.lifeDay.records : data.records
    } else {
      records = windowRecords(pastDays, period.start, period.end)
    }
  }
  const totals = period ? lifeDayTotals(records, period.start, period.end) : null

  return (
    <>
      <header class="app-header">
        <h1>🍼 Baby Tracker</h1>
        <span style="color:var(--text-soft);font-size:13px">{user.name}</span>
        <button
          class="btn-back"
          aria-label="Ajustes"
          title="Ajustes"
          onClick={() => navigate('#/ajustes')}
        >
          ⚙
        </button>
        <button class="btn-back" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout}>
          ⏻
        </button>
      </header>

      <main class="app-main">
        {!data && loading && (
          <div class="loading-screen">
            <div class="spinner" />
            <div>Cargando el día…</div>
          </div>
        )}

        {!data && error && <ErrorCard message={error.message} onRetry={() => void reload()} />}

        {data && period && (
          <>
            {/* Los dos calendarios conviven; aquí se elige con cuál mirar. */}
            <Seg<DayMode>
              options={[
                { value: 'life', label: 'Día de vida' },
                { value: 'natural', label: 'Día natural' },
              ]}
              value={mode}
              onChange={setMode}
            />

            {mode === 'life' && !data.lifeDay && (
              <button class="card lifeday-empty" onClick={() => navigate('#/ajustes')}>
                <div>
                  {data.settings.birth
                    ? 'La fecha de nacimiento es posterior a hoy. Revísala en Ajustes.'
                    : 'Añade la fecha y la hora de nacimiento para contar días de vida.'}
                </div>
                <div class="lifeday-cta">Ir a ajustes ›</div>
              </button>
            )}

            <PeriodNav
              period={period}
              back={back}
              canGoBack={canGoBack(data, mode, back)}
              onChange={setBack}
            />

            <PeriodCard
              period={period}
              totals={totals!}
              last={data.last}
              now={now}
              showFreshness={isCurrent}
            />

            {/* Solo aparece cuando hay un sueño sin cerrar: el resto del tiempo
                no ocupa sitio. Registrar un sueño se hace con su botón. */}
            {isCurrent && data.openSleep && (
              <OpenSleepBar
                sleep={data.openSleep}
                now={now}
                saving={saving}
                onEnd={() => endSleep(data.openSleep!)}
              />
            )}

            <div class="action-grid">
              <button class="action-btn action-feed" onClick={() => navigate('#/nuevo/toma')}>
                <span class="icon">🍼</span>Toma
              </button>
              <button class="action-btn action-diaper" onClick={() => navigate('#/nuevo/panal')}>
                <span class="icon">💩</span>Pañal
              </button>
              <button class="action-btn action-sleep" onClick={() => navigate('#/nuevo/sueno')}>
                <span class="icon">😴</span>Sueño
              </button>
              <button class="action-btn action-bath" onClick={() => navigate('#/nuevo/bano')}>
                <span class="icon">🛁</span>Baño
              </button>
            </div>

            <div class="card">
              <div class="card-title">{period.title} de un vistazo</div>
              <DayStrip
                start={period.start}
                end={period.end}
                records={records}
                now={now}
                onSelect={goEdit}
              />
              {isCurrent && <SleepCaption data={data} now={now} />}
            </div>

            {isCurrent && <WeightCard data={data} />}

            <div class="nav-pair">
              <button class="btn" onClick={() => navigate('#/cronologia')}>
                📋 Cronología
              </button>
              <button class="btn" onClick={() => navigate('#/evolucion')}>
                📈 Evolución
              </button>
            </div>

            {error && (
              <div class="banner banner-warn">
                No se pudo actualizar.
                <button class="banner-retry" onClick={() => void reload()}>
                  Reintentar
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}

/** El tramo que toca según el calendario elegido y cuántos se ha retrocedido. */
function periodOf(data: DayData, mode: DayMode, back: number, today: string): Period {
  if (mode === 'life' && data.lifeDay && data.settings.birth) {
    const number = data.lifeDay.number - back
    const { start, end } = lifeDayRange(data.settings.birth, number)
    return {
      title: `Día de vida ${number}`,
      subtitle: `${formatDateHuman(dateOf(start), today)} desde las ${timeOf(start)}`,
      start,
      end,
    }
  }
  const date = addDays(today, -back)
  return {
    title: formatDateHuman(date, today),
    subtitle: 'de 00:00 a 23:59',
    start: `${date} 00:00`,
    end: `${addDays(date, 1)} 00:00`,
  }
}

/** Días naturales que hay que cargar para cubrir un tramo pasado. */
function datesOf(period: Period): string[] {
  const first = dateOf(period.start)
  const last = dateOf(addMinutes(period.end, -1))
  return first === last ? [first] : [last, first]
}

/** No se retrocede antes del día de vida 1 ni antes del nacimiento. */
function canGoBack(data: DayData, mode: DayMode, back: number): boolean {
  if (mode === 'life' && data.lifeDay) return data.lifeDay.number - back > 1
  return true
}

/** Ir y volver entre el tramo actual y los anteriores. */
function PeriodNav({
  period,
  back,
  canGoBack,
  onChange,
}: {
  period: Period
  back: number
  canGoBack: boolean
  onChange: (back: number) => void
}) {
  return (
    <div class="period-nav">
      <button
        class="nav-arrow"
        aria-label="Tramo anterior"
        disabled={!canGoBack}
        onClick={() => onChange(back + 1)}
      >
        ◀
      </button>
      <div class="period-nav-main">
        <span class="period-nav-title">{period.title}</span>
        <span class="period-nav-sub">{period.subtitle}</span>
      </div>
      <button
        class="nav-arrow"
        aria-label="Tramo siguiente"
        disabled={back === 0}
        onClick={() => onChange(back - 1)}
      >
        ▶
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cómo va el periodo
// ---------------------------------------------------------------------------

function PeriodCard({
  period,
  totals: t,
  last,
  now,
  showFreshness,
}: {
  period: Period
  totals: LifeDayTotals
  last: DayData['last']
  now: string
  /** El "hace cuánto" solo tiene sentido mirando el tramo en curso. */
  showFreshness: boolean
}) {
  const elapsed = diffMinutes(period.start, now)

  return (
    <div class="card lifeday">
      {showFreshness && elapsed > 0 && (
        <div class="lifeday-head">
          <div class="lifeday-range">
            llevamos {formatDuration(Math.min(elapsed, 24 * 60))}
          </div>
        </div>
      )}

      <div class="kpi-row">
        <StatTile
          label="💧 Pises"
          value={String(t.pees)}
          note={
            !showFreshness
              ? null
              : last.pee
                ? formatAgo(diffMinutes(last.pee.start, now))
                : 'sin registros'
          }
          editId={showFreshness ? last.pee?.id : undefined}
          onEdit={goEdit}
        />
        <StatTile
          label="💩 Cacas"
          value={String(t.poops)}
          note={
            !showFreshness
              ? null
              : last.poop
                ? formatAgo(diffMinutes(last.poop.start, now))
                : 'sin registros'
          }
          editId={showFreshness ? last.poop?.id : undefined}
          onEdit={goEdit}
        />
      </div>

      <div class="kpi-milk">
        <div class="kpi-milk-head">
          <span>🥛 Leche cuantificable</span>
          <strong>{t.milkMl} ml</strong>
        </div>
        <div class="kpi-breakdown">
          <span>🍼 {t.formulaMl} ml fórmula</span>
          <span>🥛 {t.expressedMl} ml extraída</span>
        </div>
        {t.breastMin > 0 && (
          <div class="kpi-breakdown">
            {/* Los minutos de pecho no se convierten a ml: no sabemos cuánto tomó. */}
            <span>🤱 {formatDuration(t.breastMin)} de pecho directo (no cuantificable)</span>
          </div>
        )}
      </div>

      <div class="kpi-feeds">
        {t.feeds === 0 ? 'Sin tomas' : `${t.feeds} tomas`} ·{' '}
        {t.diapers === 0 ? 'sin pañales' : `${t.diapers} pañales`}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sueño sin cerrar
// ---------------------------------------------------------------------------

/**
 * Barra que solo existe mientras haya un sueño abierto.
 *
 * Si lleva demasiado tiempo abierto no ofrece cerrarlo de un toque: poner el
 * fin "ahora" guardaría un sueño de veinte horas que no ocurrió. En ese caso
 * lleva a corregirlo a mano.
 */
function OpenSleepBar({
  sleep,
  now,
  saving,
  onEnd,
}: {
  sleep: SleepRecord
  now: string
  saving: boolean
  onEnd: () => void
}) {
  const stale = isStaleSleep(sleep, now)
  return (
    <div class={stale ? 'card open-sleep open-sleep-stale' : 'card open-sleep'}>
      <span class="state-icon">{stale ? '⏱️' : '😴'}</span>
      <span class="state-main">
        <span class="state-name">{stale ? 'Sueño sin cerrar' : 'Durmiendo'}</span>
        <span class="state-since">
          desde las {timeOf(sleep.start)} · {formatDuration(diffMinutes(sleep.start, now))}
        </span>
      </span>
      {stale ? (
        <button class="btn" onClick={() => goEdit(sleep.id)}>
          Corregir
        </button>
      ) : (
        <button class="btn btn-primary" disabled={saving} onClick={onEnd}>
          ☀️ Despertó
        </button>
      )}
    </div>
  )
}

/** Pie de la franja: desde cuándo está despierto o dormido. */
function SleepCaption({ data, now }: { data: DayData; now: string }) {
  const status = babyStatus(data.openSleep, data.last.sleepEnd, now)
  if (!status.since) return <p class="field-hint">Sin sueños registrados todavía.</p>

  const record = status.state === 'asleep' ? data.openSleep : data.last.sleepEnd
  const text = `${status.state === 'asleep' ? '😴 Dormido' : '☀️ Despierto'} desde las ${timeOf(
    status.since
  )} · ${formatDuration(diffMinutes(status.since, now))}`

  if (!record) return <p class="field-hint">{text}</p>
  return (
    <button class="strip-caption" onClick={() => goEdit(record.id)}>
      {text} <span class="stat-edit">›</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

function WeightCard({ data }: { data: DayData }) {
  const last = data.last.weight
  const birth = data.settings.birthWeightG
  const change = last ? weightChange(last.grams, birth) : null

  return (
    <div class="card weight-card">
      <div class="card-title">Peso</div>
      {last ? (
        <>
          <div class="weight-row">
            <button class="weight-main" onClick={() => goEdit(last.id)}>
              <div class="weight-value">{formatKg(last.grams)}</div>
              <div class="weight-when">
                {last.start.slice(0, 10) === data.date ? 'hoy' : last.start.slice(0, 10)} ·{' '}
                {timeOf(last.start)}
              </div>
            </button>
            {change && (
              <div class="weight-change">
                <div class="weight-diff">{formatGrams(change.diffG)}</div>
                <div class="weight-pct">{formatPercent(change.percent)}</div>
                <div class="weight-since">desde el nacimiento</div>
              </div>
            )}
          </div>
          {birth > 0 && <div class="weight-birth">Al nacer {formatKg(birth)}</div>}
        </>
      ) : (
        <div class="weight-empty">
          {birth > 0
            ? `Al nacer ${formatKg(birth)}. Todavía no hay ninguna pesada.`
            : 'Todavía no hay ninguna pesada. El peso al nacer se indica en Ajustes.'}
        </div>
      )}
      <button class="btn" style="margin-top:12px" onClick={() => navigate('#/nuevo/peso')}>
        ⚖️ Añadir pesada
      </button>
    </div>
  )
}
