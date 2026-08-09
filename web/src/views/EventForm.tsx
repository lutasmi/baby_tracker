import { useMemo, useRef, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { AmountField, MomentField, ScreenTitle, Seg } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { dateOf, diffMinutes, formatDuration, nowMadrid } from '../lib/dates'
import { newId } from '../lib/events'
import {
  buildInput,
  initialState,
  validate,
  type ComponentKey,
  type FormState,
} from '../lib/eventform'
import { eventTitle } from '../lib/summary'
import { findCachedEvent } from '../store'
import { showToast } from '../toast'
import type { BabyEvent, EventType, FeedComponents } from '../types'

const NEW_TITLES: Record<EventType, string> = {
  sleep: 'Registrar sueño',
  feed: 'Registrar toma',
  diaper: 'Registrar pañal',
  bath: 'Registrar baño',
}

const COMPONENT_CHIPS: { key: ComponentKey; label: string }[] = [
  { key: 'breast', label: '🤱 Pecho' },
  { key: 'expressed', label: '🥛 Extraída' },
  { key: 'formula', label: '🍼 Fórmula' },
]

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

function EventForm({ kind, existing }: { kind: EventType; existing: BabyEvent | null }) {
  const now = useNow()
  const today = now.slice(0, 10)
  // El último uso rellena los valores por defecto de la toma; la caché lo
  // resuelve al instante cuando se llega desde el dashboard.
  const { data } = useDay(today)
  const [state, setState] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const idRef = useRef(existing?.id ?? newId())
  // El instante en que se abrió el formulario. Fijarlo evita que las horas
  // propuestas se muevan solas mientras se está mirando la pantalla.
  const openedAt = useRef(nowMadrid())

  const s = state ?? initialState(kind, existing, data?.last.feed ?? null, openedAt.current)
  const set = (patch: Partial<FormState>) => setState({ ...s, ...patch })
  const setComponents = (patch: Partial<FeedComponents>) =>
    set({ components: { ...s.components, ...patch } })

  const problem = useMemo(() => validate(kind, s, now), [kind, s, now])

  function toggleComponent(key: ComponentKey) {
    set({
      active: s.active.includes(key) ? s.active.filter((k) => k !== key) : [...s.active, key],
    })
  }

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
        showToast(
          err instanceof ApiError ? err.message : 'No se pudo guardar. Reinténtalo.',
          'error'
        )
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
          {kind === 'sleep' && <SleepFields s={s} set={set} now={now} />}
          {kind === 'feed' && (
            <FeedFields
              s={s}
              set={set}
              setComponents={setComponents}
              toggle={toggleComponent}
              now={now}
            />
          )}
          {kind === 'diaper' && <DiaperFields s={s} set={set} now={now} />}
          {kind === 'bath' && <BathFields s={s} set={set} now={now} />}

          <div class="field">
            <span class="field-label">Nota (opcional)</span>
            <input
              type="text"
              value={s.notes}
              placeholder="Ej.: le costó dormirse"
              onInput={(e) => set({ notes: (e.target as HTMLInputElement).value })}
            />
          </div>

          {problem && <div class="banner banner-warn">{problem}</div>}

          <div class="form-actions">
            {existing && (
              <button
                type="button"
                class="btn btn-danger"
                disabled={saving}
                onClick={() => void remove()}
              >
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

// ---------------------------------------------------------------------------

function SleepFields({
  s,
  set,
  now,
}: {
  s: FormState
  set: (p: Partial<FormState>) => void
  now: string
}) {
  const duration = s.sleepOpen ? null : diffMinutes(s.start, s.end)
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
      <MomentField label="Se durmió" value={s.start} now={now} onChange={(start) => set({ start })} />
      <Seg
        options={[
          { value: 'done', label: 'Ya despertó' },
          { value: 'open', label: 'Sigue durmiendo' },
        ]}
        value={s.sleepOpen ? 'open' : 'done'}
        onChange={(v) => set({ sleepOpen: v === 'open' })}
      />
      {s.sleepOpen ? (
        <p class="field-hint">
          Se guardará sin hora de fin. Puedes cerrarlo más tarde desde la pantalla principal o
          editando el registro.
        </p>
      ) : (
        <>
          <MomentField
            label="Se despertó"
            value={s.end}
            now={now}
            onChange={(end) => set({ end })}
          />
          {duration != null && duration > 0 && <DurationLine minutes={duration} />}
        </>
      )}
    </>
  )
}

function FeedFields({
  s,
  set,
  setComponents,
  toggle,
  now,
}: {
  s: FormState
  set: (p: Partial<FormState>) => void
  setComponents: (p: Partial<FeedComponents>) => void
  toggle: (key: ComponentKey) => void
  now: string
}) {
  const duration = diffMinutes(s.start, s.end)
  return (
    <>
      <MomentField label="Inicio" value={s.start} now={now} onChange={(start) => set({ start })} />
      <MomentField label="Fin" value={s.end} now={now} onChange={(end) => set({ end })} />
      {duration >= 0 && <DurationLine minutes={duration} />}

      <div class="field">
        <span class="field-label">Qué ha tomado</span>
        <div class="chips">
          {COMPONENT_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              class={s.active.includes(c.key) ? 'on' : ''}
              onClick={() => toggle(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {s.active.includes('breast') && (
        <div class="field component-block">
          <span class="field-label">🤱 Pecho directo</span>
          <AmountField
            value={s.components.breastMin}
            onChange={(breastMin) => setComponents({ breastMin })}
            unit="min"
            presets={[5, 10, 15, 20, 30]}
            max={600}
          />
          <Seg
            options={[
              { value: 'izquierdo', label: 'Izq.' },
              { value: 'derecho', label: 'Der.' },
              { value: 'ambos', label: 'Ambos' },
            ]}
            value={s.components.breastSide ?? ''}
            onChange={(breastSide) => setComponents({ breastSide })}
          />
        </div>
      )}

      {s.active.includes('expressed') && (
        <div class="field component-block">
          <span class="field-label">🥛 Leche materna extraída</span>
          <AmountField
            value={s.components.expressedMl}
            onChange={(expressedMl) => setComponents({ expressedMl })}
            unit="ml"
            presets={[20, 40, 60, 90, 120]}
            max={1000}
          />
        </div>
      )}

      {s.active.includes('formula') && (
        <div class="field component-block">
          <span class="field-label">🍼 Fórmula</span>
          <AmountField
            value={s.components.formulaMl}
            onChange={(formulaMl) => setComponents({ formulaMl })}
            unit="ml"
            presets={[20, 40, 60, 90, 120]}
            max={1000}
          />
        </div>
      )}

      {s.active.includes('mixta') && (
        <div class="field component-block">
          <span class="field-label">🍼 Mixta (registro antiguo)</span>
          <p class="field-hint">
            Se guardó sin distinguir fórmula de leche extraída. Puedes repartirlo con los botones
            de arriba y quitar este.
          </p>
          <AmountField
            value={s.components.mixtaMl}
            onChange={(mixtaMl) => setComponents({ mixtaMl })}
            unit="ml"
            presets={[20, 40, 60, 90, 120]}
            max={1000}
          />
        </div>
      )}
    </>
  )
}

function DiaperFields({
  s,
  set,
  now,
}: {
  s: FormState
  set: (p: Partial<FormState>) => void
  now: string
}) {
  return (
    <>
      <MomentField label="Hora" value={s.start} now={now} onChange={(start) => set({ start })} />
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

function BathFields({
  s,
  set,
  now,
}: {
  s: FormState
  set: (p: Partial<FormState>) => void
  now: string
}) {
  return (
    <>
      <MomentField label="Hora" value={s.start} now={now} onChange={(start) => set({ start })} />
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
        <AmountField
          value={s.durationMin}
          onChange={(durationMin) => set({ durationMin })}
          unit="min"
          presets={[5, 10, 15, 20, 30]}
          max={240}
        />
      </div>
    </>
  )
}

function DurationLine({ minutes }: { minutes: number }) {
  return (
    <div class="duration-line">
      Duración <strong>{minutes === 0 ? 'puntual' : formatDuration(minutes)}</strong>
    </div>
  )
}
