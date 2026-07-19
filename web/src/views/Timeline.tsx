import { ErrorCard } from '../components/ui'
import { navigate, navigateReplace, useDay, useNow } from '../hooks'
import { addDays, formatDateHuman, formatDuration, isValidDate } from '../lib/dates'
import { daySummary } from '../lib/derive'
import { eventDetail, eventIcon, eventTimeLabel, eventTitle } from '../lib/summary'
import { userName } from '../store'
import type { BabyEvent } from '../types'

export function Timeline({ date }: { date?: string }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const day = date && isValidDate(date) ? date : today
  const { data, loading, error, reload } = useDay(day)

  const goTo = (d: string) => navigateReplace(`#/cronologia/${d}`)

  return (
    <>
      <div class="screen-title">
        <button class="btn-back" onClick={() => navigate('#/')} aria-label="Inicio">
          ‹
        </button>
        <h1>{formatDateHuman(day, today)}</h1>
      </div>

      <main class="app-main">
        <div class="date-nav">
          <button class="nav-arrow" aria-label="Día anterior" onClick={() => goTo(addDays(day, -1))}>
            ◀
          </button>
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value
              if (isValidDate(v)) goTo(v)
            }}
          />
          <button
            class="nav-arrow"
            aria-label="Día siguiente"
            disabled={day >= today}
            onClick={() => goTo(addDays(day, 1))}
          >
            ▶
          </button>
        </div>

        {!data && loading && (
          <div class="loading-screen">
            <div class="spinner" />
            <div>Cargando el día…</div>
          </div>
        )}

        {!data && error && <ErrorCard message={error.message} onRetry={() => void reload()} />}

        {data && (
          <>
            <DaySummaryCard events={data.events} day={day} now={now} />

            {data.events.length === 0 ? (
              <div class="empty-state">
                <span class="icon">🗓️</span>
                No hay registros este día.
              </div>
            ) : (
              <div class="tl-list">
                {data.events.map((e) => (
                  <TimelineItem key={e.id} event={e} day={day} />
                ))}
              </div>
            )}

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

function DaySummaryCard({ events, day, now }: { events: BabyEvent[]; day: string; now: string }) {
  const s = daySummary(events, day, now)
  return (
    <div class="card tl-summary">
      <div class="sum-item">
        <div class="sum-value">{formatDuration(s.sleepMin)}</div>
        <div class="sum-label">dormido</div>
      </div>
      <div class="sum-item">
        <div class="sum-value">
          {s.feeds}
          {s.bottleMl > 0 && <small> · {s.bottleMl} ml</small>}
        </div>
        <div class="sum-label">tomas</div>
      </div>
      <div class="sum-item">
        <div class="sum-value">{s.diapers}</div>
        <div class="sum-label">pañales</div>
      </div>
      <div class="sum-item">
        <div class="sum-value">{s.baths}</div>
        <div class="sum-label">baños</div>
      </div>
    </div>
  )
}

function TimelineItem({ event, day }: { event: BabyEvent; day: string }) {
  return (
    <button class="tl-item" onClick={() => navigate(`#/editar/${encodeURIComponent(event.id)}`)}>
      <span class={`tl-icon ${event.type}`}>{eventIcon(event)}</span>
      <span class="tl-body">
        <span class="tl-title">{eventTitle(event)}</span>
        <span class="tl-detail" style="display:block">
          {eventDetail(event) || ' '}
        </span>
      </span>
      <span style="text-align:right">
        <span class="tl-time" style="display:block">
          {eventTimeLabel(event, day)}
        </span>
        <span class="tl-user">{userName(event.updatedBy ?? event.createdBy)}</span>
      </span>
    </button>
  )
}
