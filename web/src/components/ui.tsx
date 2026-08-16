import type { ComponentChildren } from 'preact'
import { addMinutes } from '../lib/dates'

/** Cabecera de pantalla secundaria con botón de volver. */
export function ScreenTitle({ title, right }: { title: string; right?: ComponentChildren }) {
  return (
    <div class="screen-title">
      <button class="btn-back" onClick={() => history.back()} aria-label="Volver">
        ‹
      </button>
      <h1>{title}</h1>
      {right}
    </div>
  )
}

/** Error de carga con reintento manual. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div class="card">
      <div class="empty-state">
        <span class="icon">📡</span>
        <p>{message}</p>
        <button class="btn btn-primary" style="margin-top:14px" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    </div>
  )
}

/** Control segmentado: opciones excluyentes con botones grandes. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          class={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Interruptor independiente. A diferencia de `Seg`, varios pueden estar
 * activos a la vez: un pañal puede llevar pis y caca.
 */
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      class={checked ? 'toggle on' : 'toggle'}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
  )
}

/**
 * Casilla con una cifra grande que responde a una pregunta. Con `editId` se
 * convierte en botón y abre ese registro para corregirlo.
 */
export function StatTile({
  label,
  value,
  note,
  editId,
  onEdit,
}: {
  label: string
  value: string
  note?: string | null
  editId?: string
  onEdit?: (id: string) => void
}) {
  const body = (
    <>
      <div class="kpi-label">{label}</div>
      <div class="kpi-value">{value}</div>
      {note && <div class="kpi-fresh">{note}</div>}
    </>
  )
  if (!editId || !onEdit) return <div class="kpi-tile">{body}</div>
  return (
    <button class="kpi-tile kpi-tile-link" onClick={() => onEdit(editId)}>
      {body}
    </button>
  )
}

/**
 * Saltos de los atajos, en minutos, de mayor a menor. Se aplican sobre la hora
 * que haya, así que se acumulan: el de un minuto es para afinar y los otros
 * dos para llegar.
 */
const QUICK_STEPS = [10, 5, 1]

/** Un salto de la fila de atajos: mueve la hora que haya, no la de ahora. */
function StepButton({
  minutes,
  value,
  onChange,
}: {
  minutes: number
  value: string
  onChange: (dt: string) => void
}) {
  const signo = minutes < 0 ? '−' : '+'
  const cuantos = Math.abs(minutes)
  return (
    <button
      type="button"
      aria-label={`${cuantos} ${cuantos === 1 ? 'minuto' : 'minutos'} ${
        minutes < 0 ? 'antes' : 'después'
      }`}
      onClick={() => onChange(addMinutes(value, minutes))}
    >
      {signo}
      {cuantos}
    </button>
  )
}

/**
 * Fecha y hora con atajos para moverla a saltos.
 *
 * Los atajos **suman y restan sobre lo que hay**, así que pulsar dos veces
 * −15 son treinta minutos menos: se puede ir acercando a la hora buena sin
 * calcular nada. "ahora" es el único que salta a un sitio fijo. El resto se
 * ajusta con los selectores nativos, que tienen precisión de un minuto.
 */
export function MomentField({
  label,
  value,
  now,
  onChange,
}: {
  label: string
  value: string // 'yyyy-MM-dd HH:mm'
  now: string
  onChange: (dt: string) => void
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="dt-row">
        <input
          type="date"
          value={value.slice(0, 10)}
          onChange={(e) =>
            onChange(`${(e.target as HTMLInputElement).value} ${value.slice(11, 16)}`)
          }
        />
        <input
          type="time"
          value={value.slice(11, 16)}
          onChange={(e) =>
            onChange(`${value.slice(0, 10)} ${(e.target as HTMLInputElement).value}`)
          }
        />
      </div>
      {/* Restar a la izquierda, sumar a la derecha y el ahora en medio: la
          fila se lee como una recta de tiempo. */}
      <div class="chips chips-quick">
        {QUICK_STEPS.map((min) => (
          <StepButton key={-min} minutes={-min} value={value} onChange={onChange} />
        ))}
        <button type="button" class={value === now ? 'on' : ''} onClick={() => onChange(now)}>
          ahora
        </button>
        {[...QUICK_STEPS].reverse().map((min) => (
          <StepButton key={min} minutes={min} value={value} onChange={onChange} />
        ))}
      </div>
    </div>
  )
}

/**
 * Cantidad con precisión de una unidad. El campo admite teclear el valor
 * exacto, los atajos cubren los valores habituales y los botones afinan de uno
 * en uno: nadie tiene que pulsar sesenta veces para escribir 60.
 */
export function AmountField({
  value,
  onChange,
  unit,
  presets = [],
  max,
  step = 1,
  autoFocus,
}: {
  value: number
  onChange: (v: number) => void
  unit: string
  /** Valores habituales; sin ellos solo quedan el campo y los botones. */
  presets?: number[]
  max: number
  /** Cuánto suman y restan los botones. El campo admite cualquier valor. */
  step?: number
  autoFocus?: boolean
}) {
  const clamp = (v: number) => Math.min(max, Math.max(0, v))
  return (
    <>
      <div class="stepper">
        <button type="button" aria-label="Menos" onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <div class="stepper-input">
          <input
            type="number"
            inputMode="numeric"
            // Vacío en vez de 0 para poder teclear directamente sobre el campo.
            value={value === 0 ? '' : String(value)}
            placeholder="0"
            min={0}
            max={max}
            step={1}
            autoFocus={autoFocus}
            aria-label={unit}
            onInput={(e) => {
              const raw = (e.target as HTMLInputElement).value
              const n = Number(raw)
              onChange(raw === '' || !Number.isFinite(n) ? 0 : clamp(Math.round(n)))
            }}
          />
          <small>{unit}</small>
        </div>
        <button type="button" aria-label="Más" onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
      {presets.length > 0 && (
        <div class="chips chips-quick">
          {presets.map((p) => (
            <button key={p} type="button" class={value === p ? 'on' : ''} onClick={() => onChange(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
