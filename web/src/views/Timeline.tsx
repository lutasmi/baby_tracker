import { useEffect, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard } from '../components/ui'
import { handleAuthError, navigate, navigateReplace, useDay, useNow } from '../hooks'
import { addDays, dateOf, formatDateHuman, formatDuration, isValidDate } from '../lib/dates'
import { daySummary, feedGaps } from '../lib/derive'
import { recordDetail, recordIcon, recordTimeParts, recordTitle } from '../lib/summary'
import { userName } from '../store'
import { showToast } from '../toast'
import type { BabyRecord, DayData } from '../types'

export function Timeline({ date }: { date?: string }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const day = date && isValidDate(date) ? date : today
  const { data, loading, error, reload } = useDay(day)
  // Días anteriores traídos con "Ver anteriores". Son histórico: no cambian,
  // así que se cargan una vez y no se refrescan.
  const [older, setOlder] = useState<DayData[]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)

  // Saltar a otra fecha empieza de cero.
  useEffect(() => setOlder([]), [day])

  const goTo = (d: string) => navigateReplace(`#/cronologia/${d}`)
  const loaded = data ? [data, ...older] : []
  const oldestDate = loaded.length > 0 ? loaded[loaded.length - 1].date : day

  async function loadOlder() {
    setLoadingOlder(true)
    try {
      const previous = await getApi().getDay(addDays(oldestDate, -1))
      setOlder((current) => [...current, previous])
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo cargar.', 'error')
      }
    } finally {
      setLoadingOlder(false)
    }
  }

  return (
    <>
      <div class="screen-title">
        <button class="btn-back" onClick={() => navigate('#/')} aria-label="Inicio">
          ‹
        </button>
        <h1>Cronología</h1>
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

        {/* Aquí manda el calendario; los días de vida rigen la pantalla
            principal y la evolución. Decirlo una vez evita la confusión. */}
        <p class="field-hint" style="text-align:center">
          Días naturales, de 00:00 a 23:59
        </p>

        {!data && loading && (
          <div class="loading-screen">
            <div class="spinner" />
            <div>Cargando el día…</div>
          </div>
        )}

        {!data && error && <ErrorCard message={error.message} onRetry={() => void reload()} />}

        {loaded.length > 0 && <Stream days={loaded} today={today} now={now} />}

        {loaded.length > 0 && (
          <button class="btn" disabled={loadingOlder} onClick={() => void loadOlder()}>
            {loadingOlder
              ? 'Cargando…'
              : `↑ Ver ${formatDateHuman(addDays(oldestDate, -1), today).toLowerCase()}`}
          </button>
        )}

        {error && data && (
          <div class="banner banner-warn">
            No se pudo actualizar.
            <button class="banner-retry" onClick={() => void reload()}>
              Reintentar
            </button>
          </div>
        )}
      </main>
    </>
  )
}

/**
 * Los días cargados, uno detrás de otro, del más reciente al más antiguo. Se
 * leen como una sola corriente: muchos registros se entienden por lo que pasó
 * justo antes, aunque fuera ayer.
 */
function Stream({ days, today, now }: { days: DayData[]; today: string; now: string }) {
  // Cada registro se muestra en el día en que empieza. El día más antiguo
  // cargado recoge además lo que venía de antes, para no perder el sueño
  // nocturno que arranca fuera del tramo visible.
  const sections = days.map((data, index) => ({
    data,
    records: data.records.filter(
      (r) =>
        dateOf(r.start) === data.date ||
        (index === days.length - 1 && r.start < `${data.date} 00:00`)
    ),
  }))

  // Los huecos entre tomas se calculan sobre toda la corriente, así que la
  // primera toma de un día se compara con la última del día anterior.
  const chronological = [...sections].reverse().flatMap((s) => s.records)
  const gaps = feedGaps(chronological, days[days.length - 1].previousFeed)

  return (
    <>
      {sections.map(({ data, records }) => (
        <section class="day-section" key={data.date}>
          <DayHeader date={data.date} records={records} today={today} now={now} />
          {records.length === 0 ? (
            <div class="empty-state">
              <span class="icon">🗓️</span>
              No hay registros este día.
            </div>
          ) : (
            <div class="tl-list">
              {records.map((r) => (
                <TimelineItem
                  key={r.id}
                  record={r}
                  day={data.date}
                  gapMin={gaps.get(r.id) ?? null}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  )
}

/** Cabecera pegajosa: al desplazarse siempre se sabe de qué día se habla. */
function DayHeader({
  date,
  records,
  today,
  now,
}: {
  date: string
  records: BabyRecord[]
  today: string
  now: string
}) {
  const s = daySummary(records, date, now)
  return (
    <div class="day-header">
      <span class="day-name">{formatDateHuman(date, today)}</span>
      <span class="day-summary">
        {formatDuration(s.sleepMin)} dormido · {plural(s.feeds, 'toma', 'tomas')}
        {s.milkMl > 0 && ` · ${s.milkMl} ml`} · {plural(s.diapers, 'pañal', 'pañales')}
      </span>
    </div>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
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
