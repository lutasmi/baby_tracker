import { useMemo, useRef, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { DateTimeField, ScreenTitle, Seg, Stepper } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { addMinutes, dateOf, diffMinutes, formatDuration, nowMadrid } from '../lib/dates'
import { feedDefaults, guessSleepSubtype } from '../lib/derive'
import { newId } from '../lib/events'
import { eventTitle } from '../lib/summary'
import { findCachedEvent } from '../store'
import { showToast } from '../toast'
import type { BabyEvent, EventInput, EventType } from '../types'

const NEW_TITLES: Record<EventType, string> = {
  sleep: 'Registrar sueño',
  feed: 'Registrar toma',
  diaper: 'Registrar pañal',
  bath: 'Registrar baño',
}

export function NewEvent({ kind }: { kind: EventType }) {
  return <EventForm kind={kind} existing={null} />
}

export function EditEvent({ id }: { id: string }) {
  const existing = findCachedEvent(id)
  if (!existing) {
    return (
      <>
        <ScreenTitle title="Editar registro" />
        <main class="app-main">
          <div class="empty-state">
            <span class="icon">🔍</span>
            No se encontró el registro. Vuelve a la cronología e inténtalo de nuevo.
          </div>
        </main>
      </>
    )
  }
  return <EventForm kind={existing.type} existing={existing} />
}

interface FormState {
  subtype: string
  start: string
  end: string
  sleepDone: boolean
  durationMin: number
  quantityMl: number
  milkType: string
  breast: string
  consistency: string
  notes: string
}

function initialState(kind: EventType, existing: BabyEvent | null, lastFeed: BabyEvent | null): FormState {
  const now = nowMadrid()
  const feed = feedDefaults(lastFeed)
  const base: FormState = {
    subtype: '',
    start: now,
    end: now,
    sleepDone: true,
    durationMin: 15,
    quantityMl: feed.quantityMl,
    milkType: feed.milkType,
    breast: feed.breast,
    consistency: '',
    notes: '',
  }

  if (!existing) {
    switch (kind) {
      case 'sleep': {
        const start = addMinutes(now, -60)
        return { ...base, subtype: guessSleepSubtype(start), start, end: now }
      }
      case 'feed':
        return { ...base, subtype: feed.subtype }
      case 'diaper':
        return { ...base, subtype: 'pipi' }
      case 'bath':
        return { ...base, subtype: 'completo', durationMin: 0 }
    }
  }

  const e = existing
  const state: FormState = {
    ...base,
    subtype: e.subtype,
    start: e.start,
    end: e.end ?? now,
    sleepDone: e.type !== 'sleep' || !!e.end,
    notes: e.notes,
  }
  if (e.type === 'feed' && e.subtype === 'biberon') {
    state.quantityMl = e.quantityMl ?? state.quantityMl
    state.milkType = e.detail ?? state.milkType
  }
  if (e.type === 'feed' && e.subtype === 'lactancia') {
    state.durationMin = e.durationMin ?? 15
    state.breast = e.detail ?? state.breast
  }
  if (e.type === 'diaper') state.consistency = e.detail ?? ''
  if (e.type === 'bath') state.durationMin = e.durationMin ?? 0
  return state
}

/** Traduce el estado del formulario al evento que viaja a la API. */
function buildInput(id: string, kind: EventType, s: FormState): EventInput {
  const base = {
    id,
    type: kind,
    subtype: s.subtype,
    start: s.start,
    end: null as string | null,
    durationMin: null as number | null,
    quantityMl: null as number | null,
    detail: null as string | null,
    notes: s.notes.trim(),
  }
  switch (kind) {
    case 'sleep':
      return { ...base, end: s.sleepDone ? s.end : null }
    case 'feed':
      if (s.subtype === 'biberon') {
        return { ...base, quantityMl: s.quantityMl, detail: s.milkType }
      }
      // Lactancia: se registra la hora de fin; el inicio se deduce.
      return {
        ...base,
        start: addMinutes(s.end, -s.durationMin),
        end: s.end,
        detail: s.breast,
      }
    case 'diaper':
      return { ...base, detail: s.subtype !== 'pipi' && s.consistency ? s.consistency : null }
    case 'bath':
      return { ...base, durationMin: s.durationMin > 0 ? s.durationMin : null }
  }
}

function EventForm({ kind, existing }: { kind: EventType; existing: BabyEvent | null }) {
  const now = useNow()
  const today = now.slice(0, 10)
  // El último uso rellena los valores por defecto de la toma; la caché lo
  // resuelve al instante cuando se llega desde el dashboard.
  const { data } = useDay(today)
  const [state, setState] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const idRef = useRef(existing?.id ?? newId())

  // Con datos del día (o sin ellos si la red falla) se inicializa una vez.
  const ready = state ?? initialState(kind, existing, data?.last.feed ?? null)
  const s = ready
  const set = (patch: Partial<FormState>) => setState({ ...ready, ...patch })

  const problem = useMemo(() => validate(kind, s, now), [kind, s, now])

  async function save() {
    if (problem) return
    setSaving(true)
    try {
      const input = buildInput(idRef.current, kind, s)
      if (existing) {
        await getApi().updateEvent(input)
      } else {
        await getApi().createEvent(input)
      }
      showToast('Guardado ✓')
      navigateReplace(existing ? `#/cronologia/${dateOf(input.start)}` : '#/')
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo guardar. Reinténtalo.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing) return
    if (!confirm('¿Eliminar este registro?')) return
    setSaving(true)
    try {
      await getApi().deleteEvent(existing.id)
      showToast('Registro eliminado')
      navigateReplace(`#/cronologia/${dateOf(existing.start)}`)
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo eliminar.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ScreenTitle title={existing ? `Editar · ${eventTitle(existing)}` : NEW_TITLES[kind]} />
      <main class="app-main">
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {kind === 'sleep' && <SleepFields s={s} set={set} />}
          {kind === 'feed' && <FeedFields s={s} set={set} isNew={!existing} />}
          {kind === 'diaper' && <DiaperFields s={s} set={set} />}
          {kind === 'bath' && <BathFields s={s} set={set} />}

          <div class="field">
            <span class="field-label">Nota (opcional)</span>
            <input
              type="text"
              value={s.notes}
              placeholder="Ej.: le costó dormirse"
              onInput={(e) => set({ notes: (e.target as HTMLInputElement).value })}
            />
          </div>

          {problem && <div class="banner banner-offline">{problem}</div>}

          <div class="form-actions">
            {existing && (
              <button type="button" class="btn btn-danger" disabled={saving} onClick={() => void remove()}>
                Eliminar
              </button>
            )}
            <button type="submit" class="btn btn-primary btn-lg" disabled={saving || !!problem}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}

function validate(kind: EventType, s: FormState, now: string): string | null {
  const margin = 5
  if (diffMinutes(now, s.start) > margin && !(kind === 'feed' && s.subtype === 'lactancia')) {
    return 'La hora de inicio no puede estar en el futuro.'
  }
  if (kind === 'sleep' && s.sleepDone) {
    const dur = diffMinutes(s.start, s.end)
    if (dur <= 0) return 'El fin debe ser posterior al inicio.'
    if (dur > 24 * 60) return 'Un sueño no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
  }
  if (kind === 'feed' && s.subtype === 'lactancia' && diffMinutes(now, s.end) > margin) {
    return 'La hora de fin no puede estar en el futuro.'
  }
  return null
}

// ---------------------------------------------------------------------------

function SleepFields({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  const duration = s.sleepDone ? diffMinutes(s.start, s.end) : null
  return (
    <>
      <Seg
        options={[
          { value: 'siesta', label: '😴 Siesta' },
          { value: 'nocturno', label: '🌙 Nocturno' },
        ]}
        value={s.subtype}
        onChange={(subtype) => set({ subtype })}
      />
      <DateTimeField label="Se durmió" value={s.start} onChange={(start) => set({ start })} />
      <Seg
        options={[
          { value: 'done', label: 'Ya despertó' },
          { value: 'open', label: 'Sigue durmiendo' },
        ]}
        value={s.sleepDone ? 'done' : 'open'}
        onChange={(v) => set({ sleepDone: v === 'done' })}
      />
      {s.sleepDone && (
        <>
          <DateTimeField label="Se despertó" value={s.end} onChange={(end) => set({ end })} />
          {duration != null && duration > 0 && (
            <div class="field-label">Duración: {formatDuration(duration)}</div>
          )}
        </>
      )}
    </>
  )
}

function FeedFields({
  s,
  set,
  isNew,
}: {
  s: FormState
  set: (p: Partial<FormState>) => void
  isNew: boolean
}) {
  return (
    <>
      {isNew && (
        <Seg
          options={[
            { value: 'biberon', label: '🍼 Biberón' },
            { value: 'lactancia', label: '🤱 Lactancia' },
          ]}
          value={s.subtype}
          onChange={(subtype) => set({ subtype })}
        />
      )}
      {s.subtype === 'biberon' ? (
        <>
          <DateTimeField label="Hora" value={s.start} onChange={(start) => set({ start })} />
          <div class="field">
            <span class="field-label">Cantidad</span>
            <Stepper
              value={s.quantityMl}
              onChange={(quantityMl) => set({ quantityMl })}
              step={10}
              min={10}
              max={500}
              unit="ml"
            />
          </div>
          <div class="field">
            <span class="field-label">Tipo de leche</span>
            <Seg
              options={[
                { value: 'materna', label: 'Materna' },
                { value: 'formula', label: 'Fórmula' },
                { value: 'mixta', label: 'Mixta' },
              ]}
              value={s.milkType}
              onChange={(milkType) => set({ milkType })}
            />
          </div>
        </>
      ) : (
        <>
          <DateTimeField label="Hora de fin" value={s.end} onChange={(end) => set({ end })} />
          <div class="field">
            <span class="field-label">Duración</span>
            <DurationChips
              value={s.durationMin}
              options={[5, 10, 15, 20, 30, 45]}
              onChange={(durationMin) => set({ durationMin })}
            />
          </div>
          <div class="field">
            <span class="field-label">Pecho</span>
            <Seg
              options={[
                { value: 'izquierdo', label: 'Izquierdo' },
                { value: 'derecho', label: 'Derecho' },
                { value: 'ambos', label: 'Ambos' },
              ]}
              value={s.breast}
              onChange={(breast) => set({ breast })}
            />
          </div>
        </>
      )}
    </>
  )
}

function DiaperFields({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <>
      <DateTimeField label="Hora" value={s.start} onChange={(start) => set({ start })} />
      <div class="field">
        <span class="field-label">Contenido</span>
        <Seg
          options={[
            { value: 'pipi', label: '💧 Pipí' },
            { value: 'caca', label: '💩 Caca' },
            { value: 'ambos', label: 'Ambos' },
          ]}
          value={s.subtype}
          onChange={(subtype) => set({ subtype })}
        />
      </div>
      {s.subtype !== 'pipi' && (
        <div class="field">
          <span class="field-label">Consistencia (opcional)</span>
          <Seg
            options={[
              { value: '', label: '—' },
              { value: 'liquida', label: 'Líquida' },
              { value: 'pastosa', label: 'Pastosa' },
              { value: 'solida', label: 'Sólida' },
            ]}
            value={s.consistency}
            onChange={(consistency) => set({ consistency })}
          />
        </div>
      )}
    </>
  )
}

function BathFields({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <>
      <DateTimeField label="Hora" value={s.start} onChange={(start) => set({ start })} />
      <div class="field">
        <span class="field-label">Tipo</span>
        <Seg
          options={[
            { value: 'completo', label: '🛁 Baño completo' },
            { value: 'aseo', label: '🧽 Aseo rápido' },
          ]}
          value={s.subtype}
          onChange={(subtype) => set({ subtype })}
        />
      </div>
      <div class="field">
        <span class="field-label">Duración (opcional)</span>
        <DurationChips
          value={s.durationMin}
          options={[5, 10, 15, 20, 30]}
          onChange={(durationMin) => set({ durationMin })}
          allowNone
        />
      </div>
    </>
  )
}

function DurationChips({
  value,
  options,
  onChange,
  allowNone = false,
}: {
  value: number
  options: number[]
  onChange: (v: number) => void
  allowNone?: boolean
}) {
  // Si el valor viene de una edición y no está entre las opciones, se añade.
  const all = options.includes(value) || value === 0 ? options : [...options, value].sort((a, b) => a - b)
  return (
    <div class="chips">
      {all.map((min) => (
        <button
          key={min}
          type="button"
          class={value === min ? 'on' : ''}
          onClick={() => onChange(allowNone && value === min ? 0 : min)}
        >
          {min} min
        </button>
      ))}
    </div>
  )
}
