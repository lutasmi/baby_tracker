import type { ComponentChildren } from 'preact'

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

/** Fecha y hora en una fila, con selectores nativos del móvil. */
export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string // 'yyyy-MM-dd HH:mm'
  onChange: (dt: string) => void
}) {
  const date = value.slice(0, 10)
  const time = value.slice(11, 16)
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div style="display:flex;gap:8px">
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(`${(e.target as HTMLInputElement).value} ${time}`)}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => onChange(`${date} ${(e.target as HTMLInputElement).value}`)}
        />
      </div>
    </div>
  )
}

/** Selector numérico con botones grandes (cantidad de biberón, duración...). */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  unit,
}: {
  value: number
  onChange: (v: number) => void
  step: number
  min: number
  max: number
  unit: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div class="stepper">
      <button type="button" aria-label="Menos" onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <div class="stepper-value">
        {value} <small>{unit}</small>
      </div>
      <button type="button" aria-label="Más" onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  )
}
