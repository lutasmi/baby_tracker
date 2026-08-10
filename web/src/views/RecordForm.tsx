import { useMemo, useRef, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { AmountField, MomentField, ScreenTitle, Seg, Toggle } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { dateOf, diffMinutes, formatDuration, nowMadrid } from '../lib/dates'
import {
  buildInput,
  initialState,
  validate,
  type ComponentKey,
  type FormState,
} from '../lib/recordform'
import { formatKg, newId } from '../lib/records'
import { recordTitle } from '../lib/summary'
import { findCachedRecord } from '../store'
import { showToast } from '../toast'
import type { BabyRecord, BathKind, BreastSide, Consistency, RecordType, SleepKind } from '../types'

const NEW_TITLES: Record<RecordType, string> = {
  sleep: 'Registrar sueño',
  feed: 'Registrar toma',
  diaper: 'Registrar pañal',
  bath: 'Registrar baño',
  weight: 'Registrar peso',
}

const COMPONENT_CHIPS: { key: ComponentKey; label: string }[] = [
  { key: 'breast', label: '🤱 Pecho' },
  { key: 'expressed', label: '🥛 Extraída' },
  { key: 'formula', label: '🍼 Fórmula' },
]

export function NewRecord({ type }: { type: RecordType }) {
  return <RecordForm type={type} existing={null} />
}

export function EditRecord({ id }: { id: string }) {
  const existing = findCachedRecord(id)
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
  return <RecordForm type={existing.type} existing={existing} />
}

function RecordForm({ type, existing }: { type: RecordType; existing: BabyRecord | null }) {
  const now = useNow()
  const today = now.slice(0, 10)
  // La última toma rellena los valores por defecto; la caché lo resuelve al
  // instante cuando se llega desde el dashboard.
  const { data } = useDay(today)
  const [state, setState] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const idRef = useRef(existing?.id ?? newId())
  // El instante en que se abrió el formulario. Fijarlo evita que las horas
  // propuestas se muevan solas mientras se está mirando la pantalla.
  const openedAt = useRef(nowMadrid())

  const s = state ?? initialState(type, existing, data?.last.feed ?? null, openedAt.current)
  const set = (patch: Partial<FormState>) => setState({ ...s, ...patch })

  const problem = useMemo(() => validate(type, s, now), [type, s, now])

  function toggleComponent(key: ComponentKey) {
    set({
      active: s.active.includes(key) ? s.active.filter((k) => k !== key) : [...s.active, key],
    })
  }

  async function save() {
    if (problem) return
    setSaving(true)
    try {
      const input = buildInput(idRef.current, type, s)
      if (existing) {
        await getApi().updateRecord(input)
      } else {
        await getApi().createRecord(input)
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
      await getApi().deleteRecord(existing.type, existing.id)
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
      <ScreenTitle title={existing ? `Editar · ${recordTitle(existing)}` : NEW_TITLES[type]} />
      <main class="app-main">
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {type === 'sleep' && <SleepFields s={s} set={set} now={now} />}
          {type === 'feed' && (
            <FeedFields
              s={s}
              set={set}
              toggle={toggleComponent}
              now={now}
              previousFeedStart={existing ? null : (data?.last.feed?.start ?? null)}
            />
          )}
          {type === 'diaper' && <DiaperFields s={s} set={set} now={now} />}
          {type === 'bath' && <BathFields s={s} set={set} now={now} />}
          {type === 'weight' && <WeightFields s={s} set={set} now={now} />}

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

type FieldProps = {
  s: FormState
  set: (p: Partial<FormState>) => void
  now: string
}

function SleepFields({ s, set, now }: FieldProps) {
  const duration = s.sleepOpen ? null : diffMinutes(s.start, s.end)
  return (
    <>
      <Seg<SleepKind>
        options={[
          { value: 'siesta', label: '😴 Siesta' },
          { value: 'nocturno', label: '🌙 Nocturno' },
        ]}
        value={s.sleepKind}
        onChange={(sleepKind) => set({ sleepKind })}
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
          <MomentField label="Se despertó" value={s.end} now={now} onChange={(end) => set({ end })} />
          {duration != null && duration > 0 && <DurationLine minutes={duration} />}
        </>
      )}
    </>
  )
}

function FeedFields({
  s,
  set,
  toggle,
  now,
  previousFeedStart,
}: FieldProps & { toggle: (key: ComponentKey) => void; previousFeedStart: string | null }) {
  const duration = diffMinutes(s.start, s.end)
  // De inicio a inicio, que es como se cuenta lo de "cada tres horas".
  const sincePrevious = previousFeedStart ? diffMinutes(previousFeedStart, s.start) : null
  return (
    <>
      {sincePrevious != null && sincePrevious >= 0 && (
        <div class="gap-line">
          <strong>{formatDuration(sincePrevious)}</strong> desde la toma anterior
        </div>
      )}
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
            value={s.breastMin}
            onChange={(breastMin) => set({ breastMin })}
            unit="min"
            presets={[5, 10, 15, 20, 30]}
            max={600}
          />
          <Seg<BreastSide | ''>
            options={[
              { value: 'izquierdo', label: 'Izq.' },
              { value: 'derecho', label: 'Der.' },
              { value: 'ambos', label: 'Ambos' },
            ]}
            value={s.breastSide ?? ''}
            onChange={(v) => set({ breastSide: v || null })}
          />
        </div>
      )}

      {s.active.includes('expressed') && (
        <div class="field component-block">
          <span class="field-label">🥛 Leche materna extraída</span>
          <AmountField
            value={s.expressedMl}
            onChange={(expressedMl) => set({ expressedMl })}
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
            value={s.formulaMl}
            onChange={(formulaMl) => set({ formulaMl })}
            unit="ml"
            presets={[20, 40, 60, 90, 120]}
            max={1000}
          />
        </div>
      )}
    </>
  )
}

function DiaperFields({ s, set, now }: FieldProps) {
  return (
    <>
      <MomentField label="Hora" value={s.start} now={now} onChange={(start) => set({ start })} />
      <div class="field">
        <span class="field-label">Qué había</span>
        {/* Pis y caca son independientes: pueden estar los dos o solo uno. */}
        <div class="toggle-row">
          <Toggle
            label="💧 Pis"
            checked={s.pee}
            onChange={(pee) => set({ pee })}
          />
          <Toggle
            label="💩 Caca"
            checked={s.poop}
            onChange={(poop) => set({ poop })}
          />
        </div>
      </div>
      {s.poop && (
        <div class="field">
          <span class="field-label">Consistencia (opcional)</span>
          <Seg<Consistency | ''>
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

function BathFields({ s, set, now }: FieldProps) {
  return (
    <>
      <MomentField label="Hora" value={s.start} now={now} onChange={(start) => set({ start })} />
      <div class="field">
        <span class="field-label">Tipo</span>
        <Seg<BathKind>
          options={[
            { value: 'completo', label: '🛁 Baño completo' },
            { value: 'aseo', label: '🧽 Aseo rápido' },
          ]}
          value={s.bathKind}
          onChange={(bathKind) => set({ bathKind })}
        />
      </div>
      <div class="field">
        <span class="field-label">Duración (opcional)</span>
        <AmountField
          value={s.bathDurationMin}
          onChange={(bathDurationMin) => set({ bathDurationMin })}
          unit="min"
          presets={[5, 10, 15, 20, 30]}
          max={240}
        />
      </div>
    </>
  )
}

function WeightFields({ s, set, now }: FieldProps) {
  return (
    <>
      <MomentField label="Hora" value={s.start} now={now} onChange={(start) => set({ start })} />
      <div class="field">
        <span class="field-label">Peso</span>
        <AmountField
          value={s.grams}
          onChange={(grams) => set({ grams })}
          unit="g"
          max={30000}
          step={10}
        />
        {s.grams > 0 && <div class="field-hint">= {formatKg(s.grams)}</div>}
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
