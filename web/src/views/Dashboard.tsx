import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard, GoalBar } from '../components/ui'
import { handleAuthError, navigate, useDay, useNow } from '../hooks'
import { diffMinutes, formatAgo, formatDuration, nowMadrid, timeOf } from '../lib/dates'
import { babyStatus, guessSleepKind, sleepMinutesOnDate } from '../lib/derive'
import { newId } from '../lib/records'
import { recordDetail, recordIcon } from '../lib/summary'
import { userName } from '../store'
import { showToast } from '../toast'
import type { BabyRecord, DayData, LifeDay, Settings, SleepRecord, User } from '../types'

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
            <LifeDayCard lifeDay={data.lifeDay} settings={data.settings} now={now} />

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

            <RegisteredCard
              data={data}
              now={now}
              today={today}
              saving={saving}
              onStartSleep={startSleep}
              onEndSleep={endSleep}
            />

            <button class="btn btn-lg" onClick={() => navigate('#/cronologia')}>
              📋 Cronología del día
            </button>

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

// ---------------------------------------------------------------------------
// Día de vida: el bloque principal de la pantalla
// ---------------------------------------------------------------------------

function LifeDayCard({
  lifeDay,
  settings,
  now,
}: {
  lifeDay: LifeDay | null
  settings: Settings
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
  const goals = settings.goals
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
        <KpiTile icon="💧" label="Pises" value={t.pees} goal={goals.pees} />
        <KpiTile icon="💩" label="Cacas" value={t.poops} goal={goals.poops} />
      </div>

      <div class="kpi-milk">
        <div class="kpi-milk-head">
          <span>🥛 Leche cuantificable</span>
          <strong>
            {t.milkMl}
            {goals.milkMl > 0 && <span class="kpi-goal"> / {goals.milkMl}</span>} ml
          </strong>
        </div>
        <GoalBar value={t.milkMl} goal={goals.milkMl} />
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

function KpiTile({
  icon,
  label,
  value,
  goal,
}: {
  icon: string
  label: string
  value: number
  goal: number
}) {
  return (
    <div class="kpi-tile">
      <div class="kpi-label">
        {icon} {label}
      </div>
      <div class="kpi-value">
        {value}
        {goal > 0 && <span class="kpi-goal"> / {goal}</span>}
      </div>
      <GoalBar value={value} goal={goal} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lo registrado: última toma, último pañal, sueño
// ---------------------------------------------------------------------------

function RegisteredCard({
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

  return (
    <div class="card">
      <div class="card-title">Lo registrado</div>
      <div class="stat-list">
        <div class="stat-item">
          <span class="icon">{asleep ? '😴' : status.state === 'awake' ? '☀️' : '👶'}</span>
          <div class="stat-main">
            <div class="stat-label">
              {asleep ? 'Último sueño' : 'Último despertar'}
              {status.since ? ` · ${timeOf(status.since)}` : ''}
            </div>
            <div class="stat-value">
              {asleep
                ? 'Sin cerrar'
                : status.state === 'awake'
                  ? 'Despierto'
                  : 'Sin sueños registrados'}
            </div>
          </div>
          {status.since && (
            <span class="stat-ago">{formatDuration(diffMinutes(status.since, now))}</span>
          )}
        </div>

        <LastRecordStat label="Última toma" record={data.last.feed} now={now} />
        <LastRecordStat label="Último pañal" record={data.last.diaper} now={now} />

        <div class="stat-item">
          <span class="icon">🌙</span>
          <div class="stat-main">
            <div class="stat-label">Dormido hoy (día natural)</div>
            <div class="stat-value">
              {formatDuration(sleepMinutesOnDate(data.records, today, now))}
            </div>
          </div>
        </div>
      </div>

      {status.staleTimer && data.openSleep && (
        <div class="banner banner-note">
          <span>Hay un sueño abierto desde las {timeOf(data.openSleep.start)} sin hora de fin.</span>
          <button
            class="banner-retry"
            onClick={() => navigate(`#/editar/${encodeURIComponent(data.openSleep!.id)}`)}
          >
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

function LastRecordStat({
  label,
  record,
  now,
}: {
  label: string
  record: BabyRecord | null
  now: string
}) {
  if (!record) {
    return (
      <div class="stat-item">
        <span class="icon">—</span>
        <div class="stat-main">
          <div class="stat-label">{label}</div>
          <div class="stat-value">Sin registros</div>
        </div>
      </div>
    )
  }
  return (
    <div class="stat-item">
      <span class="icon">{recordIcon(record)}</span>
      <div class="stat-main">
        <div class="stat-label">
          {label} · {timeOf(record.start)} · {userName(record.createdBy)}
        </div>
        <div class="stat-value">{recordDetail(record) || '—'}</div>
      </div>
      <span class="stat-ago">{formatAgo(diffMinutes(record.start, now))}</span>
    </div>
  )
}
