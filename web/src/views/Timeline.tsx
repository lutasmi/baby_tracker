import { ErrorCard } from '../components/ui'
import { navigate, navigateReplace, useDay, useNow } from '../hooks'
import { addDays, formatDateHuman, formatDuration, isValidDate } from '../lib/dates'
import { daySummary, feedGaps } from '../lib/derive'
import { recordDetail, recordIcon, recordTimeParts, recordTitle } from '../lib/summary'
import { userName } from '../store'
import type { BabyRecord } from '../types'

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
            <DaySummaryCard records={data.records} day={day} now={now} />

            {data.records.length === 0 ? (
              <div class="empty-state">
                <span class="icon">🗓️</span>
                No hay registros este día.
              </div>
            ) : (
              <div class="tl-list">
                {(() => {
                  const gaps = feedGaps(data.records, data.previousFeed)
                  return data.records.map((r) => (
                    <TimelineItem key={r.id} record={r} day={day} gapMin={gaps.get(r.id) ?? null} />
                  ))
                })()}
              </div>
            )}

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

function DaySummaryCard({
  records,
  day,
  now,
}: {
  records: BabyRecord[]
  day: string
  now: string
}) {
  const s = daySummary(records, day, now)
  return (
    <div class="card">
      {/* Deja claro de qué día se habla: aquí manda el calendario, no el
          día de vida, que es el que rige la pantalla principal. */}
      <div class="card-title">Resumen del día natural · 00:00 – 23:59</div>
      <div class="tl-summary">
      <div class="sum-item">
        <div class="sum-value">{formatDuration(s.sleepMin)}</div>
        <div class="sum-label">dormido</div>
      </div>
      <div class="sum-item">
        <div class="sum-value">
          {s.feeds}
          {s.milkMl > 0 && <small> · {s.milkMl} ml</small>}
          {s.breastMin > 0 && <small> · {s.breastMin} min</small>}
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
    </div>
  )
}

function TimelineItem({
  record,
  day,
  gapMin,
}: {
  record: BabyRecord
  day: string
  gapMin: number | null
}) {
  const when = recordTimeParts(record, day)
  const detail = recordDetail(record)
  const who = userName(record.updatedBy ?? record.createdBy)

  return (
    <button class="tl-item" onClick={() => navigate(`#/editar/${encodeURIComponent(record.id)}`)}>
      {/* La hora manda: es por lo que se recorre una cronología. */}
      <span class="tl-when">
        <span class="tl-time">{when.time}</span>
        {when.note && <span class="tl-note">{when.note}</span>}
      </span>

      <span class="tl-mark">
        <span class={`tl-icon ${record.type}`}>{recordIcon(record)}</span>
      </span>

      <span class="tl-body">
        <span class="tl-title">{recordTitle(record)}</span>
        {detail && <span class="tl-detail">{detail}</span>}
        <span class="tl-meta">
          {/* Hueco desde la toma anterior, de inicio a inicio. */}
          {gapMin != null && <span class="tl-gap">{formatDuration(gapMin)} desde la anterior</span>}
          {who && <span>{who}</span>}
        </span>
      </span>
    </button>
  )
}
