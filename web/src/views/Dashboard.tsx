import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard } from '../components/ui'
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

            <RegisteredCard
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
        <KpiTile icon="💧" label="Pises" value={t.pees} since={last.pee?.start} now={now} />
        <KpiTile icon="💩" label="Cacas" value={t.poops} since={last.poop?.start} now={now} />
      </div>

      <div class="kpi-milk">
        <div class="kpi-milk-head">
          <span>🥛 Leche cuantificable</span>
          <strong>{t.milkMl} ml</strong>
        </div>
        <div class="kpi-fresh">
          {last.feed
            ? `Última toma ${formatAgo(diffMinutes(last.feed.start, now))}`
            : 'Sin tomas registradas todavía'}
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

/**
 * Contador del día de vida con el tiempo transcurrido desde el último. El
 * "cuántos van" contesta a cómo va el día; el "hace cuánto", a si toca ya.
 */
function KpiTile({
  icon,
  label,
  value,
  since,
  now,
}: {
  icon: string
  label: string
  value: number
  since?: string
  now: string
}) {
  return (
    <div class="kpi-tile">
      <div class="kpi-label">
        {icon} {label}
      </div>
      <div class="kpi-value">{value}</div>
      <div class="kpi-fresh">
        {since ? formatAgo(diffMinutes(since, now)) : 'sin registros'}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lo registrado: sueño, última toma, último pañal, última caca
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
  const sleepRecord = asleep ? data.openSleep : data.last.sleepEnd

  return (
    <div class="card">
      <div class="card-title">Lo registrado</div>
      <div class="stat-list">
        <StatRow
          icon={asleep ? '😴' : status.state === 'awake' ? '☀️' : '👶'}
          label={`${asleep ? 'Último sueño' : 'Último despertar'}${
            status.since ? ` · ${timeOf(status.since)}` : ''
          }`}
          value={
            asleep ? 'Sin cerrar' : status.state === 'awake' ? 'Despierto' : 'Sin sueños registrados'
          }
          right={status.since ? formatDuration(diffMinutes(status.since, now)) : null}
          editId={sleepRecord?.id}
        />

        <LastRecordRow label="Última toma" record={data.last.feed} now={now} />
        <LastRecordRow label="Último pañal" record={data.last.diaper} now={now} />
        {/* La caca se sigue aparte: un pañal de solo pis no dice nada de ella. */}
        <LastRecordRow label="Última caca" record={data.last.poop} now={now} emptyText="Sin cacas" />

        <StatRow
          icon="🌙"
          label="Dormido hoy (día natural)"
          value={formatDuration(sleepMinutesOnDate(data.records, today, now))}
        />
      </div>

      {status.staleTimer && data.openSleep && (
        <div class="banner banner-note">
          <span>Hay un sueño abierto desde las {timeOf(data.openSleep.start)} sin hora de fin.</span>
          <button class="banner-retry" onClick={() => navigate(editRoute(data.openSleep!.id))}>
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

/**
 * Fila de la tarjeta. Con `editId` se convierte en botón y abre el registro
 * para corregirlo: lo último anotado es lo que más se corrige.
 */
function StatRow({
  icon,
  label,
  value,
  right,
  editId,
}: {
  icon: string
  label: string
  value: string
  right?: string | null
  editId?: string
}) {
  const body = (
    <>
      <span class="icon">{icon}</span>
      <div class="stat-main">
        <div class="stat-label">{label}</div>
        <div class="stat-value">{value}</div>
      </div>
      {right && <span class="stat-ago">{right}</span>}
      {editId && <span class="stat-edit">›</span>}
    </>
  )
  if (!editId) return <div class="stat-item">{body}</div>
  return (
    <button class="stat-item stat-item-link" onClick={() => navigate(editRoute(editId))}>
      {body}
    </button>
  )
}

function LastRecordRow({
  label,
  record,
  now,
  emptyText = 'Sin registros',
}: {
  label: string
  record: BabyRecord | null
  now: string
  emptyText?: string
}) {
  if (!record) return <StatRow icon="—" label={label} value={emptyText} />
  return (
    <StatRow
      icon={recordIcon(record)}
      label={`${label} · ${timeOf(record.start)} · ${userName(record.createdBy)}`}
      value={recordDetail(record) || '—'}
      right={formatAgo(diffMinutes(record.start, now))}
      editId={record.id}
    />
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
