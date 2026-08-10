import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { DayStrip } from '../components/DayStrip'
import { ErrorCard, Seg, StatTile } from '../components/ui'
import { handleAuthError, navigate, useDay, useDayMode, useNow } from '../hooks'
import { addDays, diffMinutes, formatAgo, formatDuration, nowMadrid, timeOf } from '../lib/dates'
import { babyStatus, guessSleepKind } from '../lib/derive'
import { lifeDayTotals } from '../lib/lifeday'
import { formatGrams, formatKg, formatPercent, newId, weightChange } from '../lib/records'
import type { DayMode } from '../prefs'
import { showToast } from '../toast'
import type { BabyRecord, DayData, LifeDayTotals, SleepRecord, User } from '../types'

const editRoute = (id: string) => `#/editar/${encodeURIComponent(id)}`
const goEdit = (id: string) => navigate(editRoute(id))

/** El periodo que se está mirando, con lo que pasó dentro. */
interface Period {
  title: string
  subtitle: string
  start: string
  end: string
  records: BabyRecord[]
  totals: LifeDayTotals
}

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const { data, loading, error, reload } = useDay(today)
  const [mode, setMode] = useDayMode()
  const [saving, setSaving] = useState(false)

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

  function startSleep() {
    const start = nowMadrid()
    void quickSleepAction(
      () =>
        getApi().createRecord({
          id: newId(),
          type: 'sleep',
          start,
          end: null,
          durationMin: null,
          kind: guessSleepKind(start),
          notes: '',
        }),
      'Sueño iniciado 🌙'
    )
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

  const period = data ? periodOf(data, mode, today) : null

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

            <PeriodCard period={period} last={data.last} now={now} />

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

            <StatusCard
              data={data}
              now={now}
              saving={saving}
              onStartSleep={startSleep}
              onEndSleep={endSleep}
            />

            <div class="card">
              <div class="card-title">{period.title} de un vistazo</div>
              <DayStrip
                start={period.start}
                end={period.end}
                records={period.records}
                now={now}
                onSelect={goEdit}
              />
            </div>

            <WeightCard data={data} />

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

/** El periodo que toca según el calendario elegido. */
function periodOf(data: DayData, mode: DayMode, today: string): Period {
  if (mode === 'life' && data.lifeDay) {
    const { number, start, end, totals, records } = data.lifeDay
    return {
      title: `Día de vida ${number}`,
      subtitle: `desde las ${timeOf(start)}`,
      start,
      end,
      records,
      totals,
    }
  }
  const start = `${data.date} 00:00`
  const end = `${addDays(data.date, 1)} 00:00`
  return {
    title: data.date === today ? 'Hoy' : data.date,
    subtitle: 'de 00:00 a 23:59',
    start,
    end,
    records: data.records,
    totals: lifeDayTotals(data.records, start, end),
  }
}

// ---------------------------------------------------------------------------
// Cómo va el periodo
// ---------------------------------------------------------------------------

function PeriodCard({
  period,
  last,
  now,
}: {
  period: Period
  last: DayData['last']
  now: string
}) {
  const t = period.totals
  const elapsed = diffMinutes(period.start, now)

  return (
    <div class="card lifeday">
      <div class="lifeday-head">
        <div class="lifeday-title">{period.title}</div>
        <div class="lifeday-range">
          {period.subtitle}
          {elapsed > 0 && ` · llevamos ${formatDuration(Math.min(elapsed, 24 * 60))}`}
        </div>
      </div>

      <div class="kpi-row">
        <StatTile
          label="💧 Pises"
          value={String(t.pees)}
          note={last.pee ? formatAgo(diffMinutes(last.pee.start, now)) : 'sin registros'}
          editId={last.pee?.id}
          onEdit={goEdit}
        />
        <StatTile
          label="💩 Cacas"
          value={String(t.poops)}
          note={last.poop ? formatAgo(diffMinutes(last.poop.start, now)) : 'sin registros'}
          editId={last.poop?.id}
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
// Estado del bebé: lo único de la pantalla que habla de ahora mismo
// ---------------------------------------------------------------------------

function StatusCard({
  data,
  now,
  saving,
  onStartSleep,
  onEndSleep,
}: {
  data: DayData
  now: string
  saving: boolean
  onStartSleep: () => void
  onEndSleep: (open: SleepRecord) => void
}) {
  const status = babyStatus(data.openSleep, data.last.sleepEnd, now)
  const asleep = status.state === 'asleep' && data.openSleep
  const sleepRecord = asleep ? data.openSleep : data.last.sleepEnd
  const elapsed = status.since ? formatDuration(diffMinutes(status.since, now)) : null
  const state = asleep ? 'Dormido' : status.state === 'awake' ? 'Despierto' : 'Sin sueños aún'
  const icon = asleep ? '😴' : status.state === 'awake' ? '☀️' : '👶'

  const stateBody = (
    <>
      <span class="state-icon">{icon}</span>
      <span class="state-main">
        <span class="state-name">{state}</span>
        <span class="state-since">
          {status.since ? `desde las ${timeOf(status.since)}` : 'sin sueños registrados todavía'}
          {elapsed && ` · ${elapsed}`}
        </span>
      </span>
      {sleepRecord && <span class="stat-edit">›</span>}
    </>
  )

  return (
    <div class="card">
      {sleepRecord ? (
        <button class="state-row state-row-link" onClick={() => goEdit(sleepRecord.id)}>
          {stateBody}
        </button>
      ) : (
        <div class="state-row">{stateBody}</div>
      )}

      {status.staleTimer && data.openSleep && (
        <div class="banner banner-note">
          <span>Hay un sueño abierto desde las {timeOf(data.openSleep.start)} sin hora de fin.</span>
          <button class="banner-retry" onClick={() => goEdit(data.openSleep!.id)}>
            Corregir
          </button>
        </div>
      )}

      <button
        class="btn btn-primary btn-lg"
        style="margin-top:12px"
        disabled={saving}
        onClick={() => (asleep ? onEndSleep(data.openSleep!) : onStartSleep())}
      >
        {asleep ? '☀️ Se ha despertado' : '🌙 Se ha dormido'}
      </button>
    </div>
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
      <div class="nav-pair" style="margin-top:12px">
        <button class="btn" onClick={() => navigate('#/nuevo/peso')}>
          ⚖️ Añadir pesada
        </button>
        <button class="btn" onClick={() => navigate('#/evolucion')}>
          📈 Ver evolución
        </button>
      </div>
    </div>
  )
}
