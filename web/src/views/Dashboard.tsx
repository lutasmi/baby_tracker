import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard, StatTile } from '../components/ui'
import { handleAuthError, navigate, useDay, useNow } from '../hooks'
import { diffMinutes, formatAgo, formatDuration, nowMadrid, timeOf } from '../lib/dates'
import { babyStatus, guessSleepKind, sleepMinutesOnDate } from '../lib/derive'
import {
  formatGrams,
  formatKg,
  formatPercent,
  newId,
  weightChange,
} from '../lib/records'
import { showToast } from '../toast'
import type { DayData, LifeDay, Settings, SleepRecord, User } from '../types'

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const { data, loading, error, reload } = useDay(today)
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

        {data && (
          <>
            <LifeDayCard
              lifeDay={data.lifeDay}
              settings={data.settings}
              last={data.last}
              now={now}
            />

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
              today={today}
              saving={saving}
              onStartSleep={startSleep}
              onEndSleep={endSleep}
            />

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

const editRoute = (id: string) => `#/editar/${encodeURIComponent(id)}`
const goEdit = (id: string) => navigate(editRoute(id))

// ---------------------------------------------------------------------------
// Día de vida: el bloque principal de la pantalla
// ---------------------------------------------------------------------------

function LifeDayCard({
  lifeDay,
  settings,
  last,
  now,
}: {
  lifeDay: LifeDay | null
  settings: Settings
  last: DayData['last']
  now: string
}) {
  if (!lifeDay) {
    return (
      <button class="card lifeday-empty" onClick={() => navigate('#/ajustes')}>
        <div class="card-title">Día de vida</div>
        <div>
          {settings.birth
            ? 'La fecha de nacimiento es posterior a hoy. Revísala en Ajustes.'
            : 'Añade la fecha y la hora de nacimiento para seguir los días de vida.'}
        </div>
        <div class="lifeday-cta">Ir a ajustes ›</div>
      </button>
    )
  }

  const t = lifeDay.totals
  const elapsed = diffMinutes(lifeDay.start, now)

  return (
    <div class="card lifeday">
      <div class="lifeday-head">
        <div class="card-title" style="margin:0">
          Día de vida
        </div>
        <div class="lifeday-number">{lifeDay.number}</div>
        <div class="lifeday-range">
          desde las {timeOf(lifeDay.start)} · llevamos {formatDuration(Math.max(0, elapsed))}
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
        {t.feeds === 0 ? 'Sin tomas registradas' : `${t.feeds} tomas registradas`} ·{' '}
        {t.diapers === 0 ? 'sin pañales' : `${t.diapers} pañales`}
      </div>
    </div>
  )
}



// ---------------------------------------------------------------------------
// Cómo vamos: el estado del bebé y lo que no cabe en los contadores de arriba
// ---------------------------------------------------------------------------

function StatusCard({
  data,
  now,
  today,
  saving,
  onStartSleep,
  onEndSleep,
}: {
  data: DayData
  now: string
  today: string
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

  return (
    <div class="card">
      <div class="card-title">¿Cómo vamos?</div>

      {/* El estado es lo único de esta pantalla que describe un ahora mismo. */}
      <SleepState
        icon={icon}
        state={state}
        since={status.since}
        elapsed={elapsed}
        editId={sleepRecord?.id}
      />

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

      {/* Pises y cacas no se repiten aquí: sus contadores, arriba, ya llevan
          cuánto hace del último y abren su registro. */}
      <div class="kpi-row" style="margin-top:12px">
        <StatTile
          label="🍼 Última toma"
          value={data.last.feed ? formatAgo(diffMinutes(data.last.feed.start, now)) : 'Sin tomas'}
          note={data.last.feed ? `a las ${timeOf(data.last.feed.start)}` : null}
          editId={data.last.feed?.id}
          onEdit={goEdit}
        />
        <StatTile
          label="🌙 Dormido hoy"
          value={formatDuration(sleepMinutesOnDate(data.records, today, now))}
          note="día natural"
        />
      </div>
    </div>
  )
}

function SleepState({
  icon,
  state,
  since,
  elapsed,
  editId,
}: {
  icon: string
  state: string
  since: string | null
  elapsed: string | null
  editId?: string
}) {
  const body = (
    <>
      <span class="state-icon">{icon}</span>
      <span class="state-main">
        <span class="state-name">{state}</span>
        <span class="state-since">
          {since ? `desde las ${timeOf(since)}` : 'sin sueños registrados todavía'}
          {elapsed && ` · ${elapsed}`}
        </span>
      </span>
      {editId && <span class="stat-edit">›</span>}
    </>
  )
  if (!editId) return <div class="state-row">{body}</div>
  return (
    <button class="state-row state-row-link" onClick={() => goEdit(editId)}>
      {body}
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
            <button class="weight-main" onClick={() => navigate(editRoute(last.id))}>
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
