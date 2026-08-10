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

const QUICK_OFFSETS = [5, 15, 30, 60]

/**
 * Fecha y hora con atajos relativos al momento actual. Lo habitual es anotar
 * algo que acaba de pasar ("hace 15 minutos"), así que esos casos se resuelven
 * de un toque; el resto se ajusta con los selectores nativos, que tienen
 * precisión de un minuto.
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
      <div class="chips chips-quick">
        <button type="button" class={value === now ? 'on' : ''} onClick={() => onChange(now)}>
          ahora
        </button>
        {QUICK_OFFSETS.map((min) => {
          const target = addMinutes(now, -min)
          return (
            <button
              key={min}
              type="button"
              class={value === target ? 'on' : ''}
              onClick={() => onChange(target)}
            >
              −{min < 60 ? `${min} min` : `${min / 60} h`}
            </button>
          )
        })}
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
