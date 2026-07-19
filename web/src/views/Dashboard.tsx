import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard } from '../components/ui'
import { handleAuthError, navigate, useDay, useNow } from '../hooks'
import { diffMinutes, formatAgo, formatDuration, nowMadrid, timeOf } from '../lib/dates'
import { babyStatus, guessSleepSubtype, sleepMinutesOnDate } from '../lib/derive'
import { newId, toInput } from '../lib/events'
import { eventDetail, eventIcon } from '../lib/summary'
import { userName } from '../store'
import { showToast } from '../toast'
import type { BabyEvent, User } from '../types'

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
        getApi().createEvent({
          id: newId(),
          type: 'sleep',
          subtype: guessSleepSubtype(start),
          start,
          end: null,
          durationMin: null,
          quantityMl: null,
          detail: null,
          notes: '',
        }),
      'Sueño iniciado 🌙'
    )
  }

  function endSleep(active: BabyEvent) {
    void quickSleepAction(
      () => getApi().updateEvent({ ...toInput(active), end: nowMadrid() }),
      'Despertar registrado ☀️'
    )
  }

  return (
    <>
      <header class="app-header">
        <h1>🍼 Baby Tracker</h1>
        <span style="color:var(--text-soft);font-size:13px">{user.name}</span>
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
            <StatusHero
              data={{ activeSleep: data.activeSleep, lastSleepEnd: data.last.sleepEnd }}
              now={now}
              saving={saving}
              onStartSleep={startSleep}
              onEndSleep={endSleep}
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

            <div class="card">
              <div class="card-title">Ahora mismo</div>
              <div class="stat-list">
                <LastEventStat label="Última toma" event={data.last.feed} now={now} />
                <LastEventStat label="Último pañal" event={data.last.diaper} now={now} />
                <div class="stat-item">
                  <span class="icon">🌙</span>
                  <div class="stat-main">
                    <div class="stat-label">Dormido hoy</div>
                    <div class="stat-value">
                      {formatDuration(sleepMinutesOnDate(data.events, today, now))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button class="btn btn-lg" onClick={() => navigate('#/cronologia')}>
              📋 Cronología del día
            </button>

            {error && (
              <div class="banner banner-offline">
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

function StatusHero({
  data,
  now,
  saving,
  onStartSleep,
  onEndSleep,
}: {
  data: { activeSleep: BabyEvent | null; lastSleepEnd: BabyEvent | null }
  now: string
  saving: boolean
  onStartSleep: () => void
  onEndSleep: (active: BabyEvent) => void
}) {
  const status = babyStatus(data.activeSleep, data.lastSleepEnd)
  const elapsed = status.since ? formatDuration(diffMinutes(status.since, now)) : null

  return (
    <div class="card status-hero">
      {status.state === 'asleep' && data.activeSleep ? (
        <>
          <div class="icon">😴</div>
          <div class="state">Dormido</div>
          {elapsed && <div class="elapsed">{elapsed}</div>}
          {status.since && <div class="since">desde las {timeOf(status.since)}</div>}
          <div class="hero-action">
            <button
              class="btn btn-primary btn-lg"
              disabled={saving}
              onClick={() => onEndSleep(data.activeSleep!)}
            >
              ☀️ Se ha despertado
            </button>
          </div>
        </>
      ) : (
        <>
          <div class="icon">{status.state === 'awake' ? '☀️' : '👶'}</div>
          <div class="state">Despierto</div>
          {elapsed && <div class="elapsed">{elapsed}</div>}
          {status.since ? (
            <div class="since">desde las {timeOf(status.since)}</div>
          ) : (
            <div class="since">sin sueños registrados todavía</div>
          )}
          <div class="hero-action">
            <button class="btn btn-primary btn-lg" disabled={saving} onClick={onStartSleep}>
              🌙 Se ha dormido
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function LastEventStat({
  label,
  event,
  now,
}: {
  label: string
  event: BabyEvent | null
  now: string
}) {
  if (!event) {
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
      <span class="icon">{eventIcon(event)}</span>
      <div class="stat-main">
        <div class="stat-label">
          {label} · {timeOf(event.start)} · {userName(event.createdBy)}
        </div>
        <div class="stat-value">{eventDetail(event) || '—'}</div>
      </div>
      <span class="stat-ago">{formatAgo(diffMinutes(event.start, now))}</span>
    </div>
  )
}
