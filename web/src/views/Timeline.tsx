import { Fragment } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ErrorCard, Seg } from '../components/ui'
import { navigate, navigateReplace, useDay, useDayMode, useDays, useNow } from '../hooks'
import {
  addDays,
  addMinutes,
  dateOf,
  formatDateHuman,
  formatDuration,
  formatSpan,
  isValidDate,
} from '../lib/dates'
import { daySummary, feedGaps } from '../lib/derive'
import { lifeDayNumber, lifeDayRange } from '../lib/lifeday'
import { recordDetail, recordIcon, recordTitle } from '../lib/summary'
import { filterByType, timelineRows, windowRecords } from '../lib/timeline'
import type { DayMode } from '../prefs'
import { userName } from '../store'
import type { BabyRecord, DayData, RecordType } from '../types'

/** Los filtros, en el orden en que se usan a lo largo del día. */
const FILTERS: { type: RecordType; label: string }[] = [
  { type: 'feed', label: '🍼 Tomas' },
  { type: 'diaper', label: '💩 Pañales' },
  { type: 'sleep', label: '😴 Sueño' },
  { type: 'bath', label: '🛁 Baños' },
  { type: 'weight', label: '⚖️ Peso' },
]

/** Un tramo de la cronología: un día natural o un día de vida. */
interface Section {
  key: string
  title: string
  subtitle: string
  start: string
  end: string
  /** Número de día de vida; ausente en los días naturales. */
  number?: number
}

export function Timeline({ date }: { date?: string }) {
  const now = useNow()
  const today = now.slice(0, 10)
  const day = date && isValidDate(date) ? date : today
  const { data, loading, error, reload } = useDay(day)
  const [mode, setMode] = useDayMode()
  // Cuántos tramos se han añadido hacia atrás y hacia delante.
  const [extra, setExtra] = useState(0)
  const [ahead, setAhead] = useState(0)
  // Tipos que se quieren ver. Vacío es verlo todo, que es lo habitual.
  const [types, setTypes] = useState<RecordType[]>([])

  // Cambiar de fecha o de calendario empieza de cero.
  useEffect(() => {
    setExtra(0)
    setAhead(0)
  }, [day, mode])

  const toggleType = (t: RecordType) =>
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])

  const goTo = (d: string) => navigateReplace(`#/cronologia/${d}`)
  const birth = data?.settings.birth ?? null
  const useLife = mode === 'life' && birth != null
  const sections = useLife
    ? lifeSections(birth, day, today, now, extra, ahead)
    : naturalSections(day, today, extra, ahead)
  // Hacia delante se para en el tramo en curso; hacia atrás, en el primero.
  const hayPosteriores = useLife
    ? sections.length > 0 && sections[0].number! < lifeDayNumber(birth, now)
    : sections.length > 0 && dateOf(sections[0].start) < today
  const hayAnteriores = !useLife || (sections[sections.length - 1]?.number ?? 1) > 1

  // Un día de vida cae casi siempre a caballo de dos días naturales.
  const dates = [...new Set(sections.flatMap((s) => datesOf(s)))].sort().reverse()
  const { days, loading: loadingDays } = useDays(dates)

  return (
    <>
      <div class="screen-title">
        <button class="btn-back" onClick={() => navigate('#/')} aria-label="Inicio">
          ‹
        </button>
        <h1>Cronología</h1>
      </div>

      <main class="app-main">
        <Seg<DayMode>
          options={[
            { value: 'life', label: 'Día de vida' },
            { value: 'natural', label: 'Día natural' },
          ]}
          value={mode}
          onChange={setMode}
        />

        <div class="date-nav">
          <button class="nav-arrow" aria-label="Anterior" onClick={() => goTo(addDays(day, -1))}>
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
            aria-label="Siguiente"
            disabled={day >= today}
            onClick={() => goTo(addDays(day, 1))}
          >
            ▶
          </button>
        </div>

        {/* Filtrar por tipo: la cronología completa es lo normal, pero para
            seguir una sola cosa —cuántas veces ha comido, cómo ha dormido—
            estorba todo lo demás. */}
        <div class="chips tl-filter">
          {FILTERS.map((f) => (
            <button
              key={f.type}
              type="button"
              class={types.includes(f.type) ? 'on' : ''}
              aria-pressed={types.includes(f.type)}
              onClick={() => toggleType(f.type)}
            >
              {f.label}
            </button>
          ))}
          {types.length > 0 && (
            <button type="button" class="btn-link" onClick={() => setTypes([])}>
              Ver todo
            </button>
          )}
        </div>

        {mode === 'life' && !birth && (
          <p class="field-hint" style="text-align:center">
            Sin fecha de nacimiento no hay días de vida: se muestran días naturales.
          </p>
        )}

        {!data && loading && (
          <div class="loading-screen">
            <div class="spinner" />
            <div>Cargando…</div>
          </div>
        )}

        {!data && error && <ErrorCard message={error.message} onRetry={() => void reload()} />}

        {/* Los tramos más recientes se añaden arriba y los más antiguos abajo,
            que es hacia donde apunta cada flecha. */}
        {data && hayPosteriores && (
          <button class="btn" disabled={loadingDays} onClick={() => setAhead(ahead + 1)}>
            {loadingDays ? 'Cargando…' : '↑ Ver posteriores'}
          </button>
        )}

        {data && <Stream sections={sections} days={days} now={now} types={types} />}

        {data && hayAnteriores && (
          <button class="btn" disabled={loadingDays} onClick={() => setExtra(extra + 1)}>
            {loadingDays ? 'Cargando…' : '↓ Ver anteriores'}
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

/** Días naturales que hay que cargar para cubrir un tramo. */
function datesOf(section: Section): string[] {
  const first = dateOf(section.start)
  const last = dateOf(addMinutes(section.end, -1))
  return first === last ? [first] : [first, last]
}

function naturalSections(day: string, today: string, extra: number, ahead: number): Section[] {
  // Del más reciente al más antiguo, sin pasar de hoy.
  const first = minDate(addDays(day, ahead), today)
  const out: Section[] = []
  for (let d = first; d >= addDays(day, -extra); d = addDays(d, -1)) {
    out.push({
      key: d,
      title: formatDateHuman(d, today),
      subtitle: 'de 00:00 a 23:59',
      start: `${d} 00:00`,
      end: `${addDays(d, 1)} 00:00`,
    })
  }
  return out
}

const minDate = (a: string, b: string) => (a < b ? a : b)

function lifeSections(
  birth: string,
  day: string,
  today: string,
  now: string,
  extra: number,
  ahead: number
): Section[] {
  // El día de vida que contiene la fecha elegida (o el actual, si es hoy).
  const current = Math.max(1, lifeDayNumber(birth, now))
  const anchor = Math.min(current, Math.max(1, lifeDayNumber(birth, day === today ? now : `${day} 12:00`)))
  const first = Math.min(current, anchor + ahead)
  const out: Section[] = []
  for (let number = first; number >= Math.max(1, anchor - extra); number--) {
    const range = lifeDayRange(birth, number)
    out.push({
      key: `vida-${number}`,
      number: number,
      title: `Día de vida ${number}`,
      // Las dos fechas: el tramo acaba en la del día siguiente.
      subtitle: formatSpan(range.start, range.end),
      start: range.start,
      end: range.end,
    })
  }
  return out
}

/**
 * Los tramos cargados, uno detrás de otro, del más reciente al más antiguo. Se
 * leen como una sola corriente: muchos registros solo se entienden por lo que
 * pasó justo antes, aunque fuera ayer.
 */
function Stream({
  sections,
  days,
  now,
  types,
}: {
  sections: Section[]
  days: DayData[]
  now: string
  /** Tipos que se están mirando; vacío es todos. */
  types: RecordType[]
}) {
  const withRecords = sections.map((section, index) => ({
    section,
    records: windowRecords(days, section.start, section.end, {
      // Solo el tramo más antiguo recoge lo que venía de antes, para no
      // perderlo ni repetirlo en los tramos de arriba.
      includeEarlier: index === sections.length - 1,
    }),
  }))

  // Los huecos entre tomas se calculan sobre toda la corriente —y sobre todos
  // los registros, filtre lo que filtre la pantalla—, así que la primera toma
  // de un tramo se compara con la última del anterior.
  const chronological = [...withRecords].reverse().flatMap((s) => s.records)
  const oldest = days.find((d) => d.date === dateOf(sections[sections.length - 1]?.start ?? ''))
  const gaps = feedGaps(chronological, oldest?.previousFeed ?? null)

  return (
    <>
      {withRecords.map(({ section, records }) => {
        // El resumen de la cabecera es del tramo entero, no de lo filtrado:
        // dice cómo fue el día, y eso no cambia por mirar una sola cosa.
        const visible = filterByType(records, types)
        return (
        <section class="day-section" key={section.key}>
          <SectionHeader section={section} records={records} now={now} />
          {visible.length === 0 ? (
            <div class="empty-state">
              <span class="icon">🗓️</span>
              {records.length === 0
                ? 'No hay registros en este tramo.'
                : 'Nada de lo filtrado en este tramo.'}
            </div>
          ) : (
            <div class="tl-list">
              {timelineRows(visible, section).map(({ record, when, dayBreak }) => (
                <Fragment key={record.id}>
                  {/* Dónde cambia la fecha dentro del tramo. */}
                  {dayBreak && (
                    <div class="tl-daybreak">{formatDateHuman(dayBreak, dateOf(now))}</div>
                  )}
                  <TimelineItem
                    record={record}
                    when={when}
                    gapMin={gaps.get(record.id) ?? null}
                  />
                </Fragment>
              ))}
            </div>
          )}
        </section>
        )
      })}
    </>
  )
}

/** Cabecera pegajosa: al desplazarse siempre se sabe de qué tramo se habla. */
function SectionHeader({
  section,
  records,
  now,
}: {
  section: Section
  records: BabyRecord[]
  now: string
}) {
  const s = daySummary(records, section, now)
  return (
    <div class="day-header">
      <span class="day-name">
        {section.title} <small>{section.subtitle}</small>
      </span>
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
  when,
  gapMin,
}: {
  record: BabyRecord
  when: { time: string; note: string | null }
  gapMin: number | null
}) {
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
