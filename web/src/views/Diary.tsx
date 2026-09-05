import { useEffect, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { ErrorCard, ScreenTitle, Seg } from '../components/ui'
import { handleAuthError, navigate, useNow } from '../hooks'
import { formatDateHuman, timeOf } from '../lib/dates'
import { diaryDays, onlyStarred } from '../lib/diary'
import { cacheNotes, userName } from '../store'
import type { DiaryDay } from '../lib/diary'
import type { Diary, NoteRecord } from '../types'

/** Cuántas notas se piden de golpe, y cuántas más con cada "Ver más". */
const PAGE = 60

type Filter = 'todas' | 'destacadas'

/**
 * El diario: las notas seguidas, sin el ruido de tomas y pañales.
 *
 * Es la pantalla que gana valor con el tiempo. Va por fechas del calendario
 * —"el día que salimos a desayunar" se busca así— con el día de vida al lado,
 * que es lo que contesta a cuántos días tenía.
 */
export function DiaryView() {
  const now = useNow()
  const today = now.slice(0, 10)
  const [diary, setDiary] = useState<Diary | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [filter, setFilter] = useState<Filter>('todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const data = await getApi().getNotes(limit)
        if (cancelled) return
        setDiary(data)
        // Para poder abrir una nota a corregirla sin volver a pedirla.
        cacheNotes(data.notes)
        setError(null)
      } catch (err) {
        if (!handleAuthError(err) && !cancelled) {
          setError(err instanceof ApiError ? err : new ApiError('INTERNAL', 'Error inesperado.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [limit])

  const todas = diary?.notes ?? []
  const visibles = filter === 'destacadas' ? onlyStarred(todas) : todas
  const days = diaryDays(visibles, diary?.birth ?? null)
  const hayDestacadas = todas.some((n) => n.starred)

  return (
    <>
      <ScreenTitle title="Diario" />
      <main class="app-main">
        <button class="btn btn-primary btn-lg" onClick={() => navigate('#/nuevo/nota')}>
          ✍️ Escribir nota
        </button>

        {/* El filtro solo aparece cuando hay algo que filtrar: con tres notas
            seguidas, elegir entre "todas" y "destacadas" no ayuda a nadie. */}
        {hayDestacadas && (
          <Seg<Filter>
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'destacadas', label: '⭐ Destacadas' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        )}

        {error && <ErrorCard message={error.message} onRetry={() => setLimit((n) => n)} />}

        {!diary && loading && (
          <div class="loading-screen">
            <div class="spinner" />
          </div>
        )}

        {diary && days.length === 0 && (
          <div class="empty-state">
            <span class="icon">📝</span>
            <p>
              {filter === 'destacadas'
                ? 'Todavía no has destacado ninguna nota.'
                : 'Aquí se guarda lo que no cabe en un registro: cómo ha estado el día, ' +
                  'lo que habéis hecho, lo que no quieres olvidar. Escribe la primera.'}
            </p>
          </div>
        )}

        <DiaryList days={days} today={today} users={diary?.users ?? {}} />

        {/* Solo tiene sentido traer más si las hay: filtrando por destacadas
            también, porque las que faltan pueden serlo. */}
        {diary?.more && (
          <button class="btn" disabled={loading} onClick={() => setLimit((n) => n + PAGE)}>
            {loading ? 'Cargando…' : 'Ver notas anteriores'}
          </button>
        )}
      </main>
    </>
  )
}

/**
 * Las notas por días. Separada de la pantalla para poder probarla con datos
 * puestos a mano, igual que las barras de la evolución.
 */
export function DiaryList({
  days,
  today,
  users,
}: {
  days: DiaryDay[]
  today: string
  users: Record<string, string>
}) {
  return (
    <>
      {days.map((day) => (
        <section class="diary-day" key={day.date}>
          <h2 class="diary-date">
            {formatDateHuman(day.date, today)}
            {/* Cuántos días tenía: la pregunta de quien relee el diario. */}
            {day.lifeDay != null && <span class="diary-lifeday">día {day.lifeDay}</span>}
          </h2>
          {day.notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              author={users[note.createdBy] ?? userName(note.createdBy)}
            />
          ))}
        </section>
      ))}
    </>
  )
}

function NoteCard({ note, author }: { note: NoteRecord; author: string }) {
  return (
    <button
      class="card diary-note"
      onClick={() => navigate(`#/editar/${encodeURIComponent(note.id)}`)}
    >
      <span class="diary-note-head">
        <span class="diary-time">
          {note.starred && <span aria-label="Destacada">⭐</span>} {timeOf(note.start)}
        </span>
        <span class="stat-edit">›</span>
      </span>
      {/* Los saltos de línea se conservan: una nota se escribe por párrafos. */}
      <span class="diary-text">{note.notes}</span>
      {author && <span class="diary-author">{author}</span>}
    </button>
  )
}
