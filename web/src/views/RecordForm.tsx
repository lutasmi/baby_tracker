import { useMemo, useRef, useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { AmountField, MomentField, ScreenTitle, Seg, Toggle } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { dateOf, diffMinutes, formatDuration, nowMadrid, timeOf } from '../lib/dates'
import {
  bottleItems,
  breastItems,
  buildInput,
  feedSummary,
  feedTimes,
  initialState,
  newBottleItem,
  newBreastItem,
  nextSide,
  validate,
  type FormState,
} from '../lib/recordform'
import { formatKg, itemMinutes, newId } from '../lib/records'
import { recordTitle } from '../lib/summary'
import { findCachedRecord } from '../store'
import { showToast } from '../toast'
import type {
  BabyRecord,
  BathKind,
  BreastSide,
  Consistency,
  FeedItem,
  FeedItemKind,
  PeeAmount,
  RecordType,
  SleepKind,
} from '../types'

const NEW_TITLES: Record<RecordType, string> = {
  sleep: 'Registrar sueño',
  feed: 'Registrar toma',
  diaper: 'Registrar pañal',
  bath: 'Registrar baño',
  weight: 'Registrar peso',
}

const BOTTLE_LABELS: Record<FeedItemKind, string> = {
  pecho: 'Tetada',
  extraida: 'Extraída',
  formula: 'Fórmula',
}

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
      // Al editar se vuelve al día del registro; una toma lo saca de sus
      // elementos, que es donde vive su hora.
      const day = type === 'feed' ? feedTimes(s).start : s.start
      navigateReplace(existing ? `#/cronologia/${dateOf(day)}` : '#/')
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
          {type === 'sleep' && <SleepFields s={s} set={set} now={now} isNew={!existing} />}
          {type === 'feed' && (
            <FeedFields
              s={s}
              set={set}
              now={now}
              previousFeedStart={existing ? null : (data?.last.feed?.start ?? null)}
              lastSide={data?.last.feed?.breastSide ?? null}
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

function SleepFields({ s, set, now, isNew }: FieldProps & { isNew: boolean }) {
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
        onChange={(v) =>
          // Empezar un cronómetro es decir "se acaba de dormir": la hora de
          // inicio pasa a ser ahora en lugar de la propuesta hacia atrás.
          set(v === 'open' ? { sleepOpen: true, ...(isNew ? { start: now } : {}) } : { sleepOpen: false })
        }
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
  now,
  previousFeedStart,
  lastSide,
}: FieldProps & {
  previousFeedStart: string | null
  lastSide: BreastSide | null
}) {
  const times = feedTimes(s)
  // De inicio a inicio, que es como se cuenta lo de "cada tres horas".
  const sincePrevious = previousFeedStart ? diffMinutes(previousFeedStart, times.start) : null
  const summary = feedSummary(s)
  const tetadas = breastItems(s.items)
  const biberones = bottleItems(s.items)

  const setItem = (id: string, patch: Partial<FeedItem>) =>
    set({ items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const removeItem = (id: string) => set({ items: s.items.filter((x) => x.id !== id) })
  const addItem = (item: FeedItem) => set({ items: [...s.items, item] })

  return (
    <>
      {sincePrevious != null && sincePrevious >= 0 && (
        <div class="gap-line">
          <strong>{formatDuration(sincePrevious)}</strong> desde la toma anterior
        </div>
      )}

      <div class="field">
        <span class="field-label">🤱 Pecho</span>
        {/* Varias tetadas siguen siendo una sola toma. Cada una guarda su hora,
            así que la toma sabe exactamente qué pasó dentro. */}
        {tetadas.map((item, index) => (
          <div class="session" key={item.id}>
            <div class="session-head">
              <span class="session-number">Tetada {index + 1}</span>
              <span class="session-min">{formatDuration(itemMinutes(item))}</span>
              <button
                type="button"
                class="session-remove"
                aria-label={`Quitar tetada ${index + 1}`}
                onClick={() => removeItem(item.id)}
              >
                ×
              </button>
            </div>
            <Seg<BreastSide>
              options={[
                { value: 'izquierdo', label: 'Izq.' },
                { value: 'derecho', label: 'Der.' },
                { value: 'ambos', label: 'Ambos' },
                // De madrugada vale más no saberlo que inventárselo.
                { value: 'desconocido', label: 'No recuerdo' },
              ]}
              value={item.side ?? 'desconocido'}
              onChange={(side) => setItem(item.id, { side })}
            />
            <MomentField
              label="Empezó"
              value={item.start}
              now={now}
              onChange={(start) => setItem(item.id, { start })}
            />
            <MomentField
              label="Terminó"
              value={item.end ?? item.start}
              now={now}
              onChange={(end) => setItem(item.id, { end })}
            />
          </div>
        ))}
        <button
          type="button"
          class="btn"
          onClick={() => addItem(newBreastItem(nextSide(s.items, lastSide), now))}
        >
          + Añadir tetada
        </button>
      </div>

      <div class="field">
        <span class="field-label">🍼 Biberón</span>
        {/* Cada biberón lleva su hora, y la de fin si se quiere anotar cuánto
            tardó en tomárselo. */}
        {biberones.map((item, index) => (
          <div class="session" key={item.id}>
            <div class="session-head">
              <span class="session-number">
                {BOTTLE_LABELS[item.kind]} {index + 1}
              </span>
              <span class="session-min">{item.ml} ml</span>
              <button
                type="button"
                class="session-remove"
                aria-label={`Quitar biberón ${index + 1}`}
                onClick={() => removeItem(item.id)}
              >
                ×
              </button>
            </div>
            <Seg<FeedItemKind>
              options={[
                { value: 'extraida', label: '🥛 Extraída' },
                { value: 'formula', label: '🍼 Fórmula' },
              ]}
              value={item.kind}
              onChange={(kind) => setItem(item.id, { kind })}
            />
            <AmountField
              value={item.ml}
              onChange={(ml) => setItem(item.id, { ml })}
              unit="ml"
              presets={[20, 40, 60, 90, 120]}
              max={1000}
            />
            <MomentField
              label={item.end ? 'Empezó' : 'Hora'}
              value={item.start}
              now={now}
              onChange={(start) => setItem(item.id, { start })}
            />
            {item.end ? (
              <>
                <MomentField
                  label="Terminó"
                  value={item.end}
                  now={now}
                  onChange={(end) => setItem(item.id, { end })}
                />
                <button
                  type="button"
                  class="btn-link"
                  onClick={() => setItem(item.id, { end: null })}
                >
                  Quitar la hora de fin
                </button>
              </>
            ) : (
              <button
                type="button"
                class="btn-link"
                onClick={() => setItem(item.id, { end: item.start })}
              >
                + Añadir hora de fin
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          class="btn"
          onClick={() => addItem(newBottleItem(nextBottleKind(biberones), lastBottleMl(biberones), now))}
        >
          + Añadir biberón
        </button>
      </div>

      {s.items.length > 0 && (
        <div class="duration-line">
          {times.start === times.end ? (
            <>
              Toma a las <strong>{timeOf(times.start)}</strong>
            </>
          ) : (
            <>
              Toma de <strong>{timeOf(times.start)}</strong> a <strong>{timeOf(times.end)}</strong>
            </>
          )}
        </div>
      )}

      {summary && <p class="field-hint feed-summary">{summary}</p>}
    </>
  )
}

/** El siguiente biberón repite el tipo y la cantidad del anterior. */
function nextBottleKind(bottles: FeedItem[]): FeedItemKind {
  return bottles[bottles.length - 1]?.kind ?? 'formula'
}

function lastBottleMl(bottles: FeedItem[]): number {
  return bottles[bottles.length - 1]?.ml ?? 0
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
      {s.pee && (
        <div class="field">
          <span class="field-label">💧 Cuánto pis (opcional)</span>
          <Seg<PeeAmount | ''>
            options={[
              { value: '', label: '—' },
              { value: 'poco', label: 'Poco' },
              { value: 'medio', label: 'Medio' },
              { value: 'mucho', label: 'Mucho' },
            ]}
            value={s.peeAmount}
            onChange={(peeAmount) => set({ peeAmount })}
          />
        </div>
      )}
      {s.poop && (
        <div class="field">
          <span class="field-label">💩 Cómo era (opcional)</span>
          <Seg<Consistency | ''>
            options={[
              { value: '', label: '—' },
              { value: 'pedete', label: 'Pedete' },
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
