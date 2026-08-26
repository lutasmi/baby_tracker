import type { Medication } from '../types'
import { DecimalField } from './ui'

/**
 * Los campos de una ficha del catálogo.
 *
 * La ficha se edita desde dos sitios —la pantalla de medicación y el alta
 * rápida al registrar una dosis—, así que los campos viven aquí y cada
 * pantalla pone sus propios botones alrededor.
 */
export function MedicationFields({
  value,
  onChange,
  autoFocus,
}: {
  value: Medication
  onChange: (m: Medication) => void
  autoFocus?: boolean
}) {
  const set = (p: Partial<Medication>) => onChange({ ...value, ...p })
  const dateValue = (e: Event) => (e.target as HTMLInputElement).value || null

  return (
    <>
      <div class="field">
        <span class="field-label">Nombre</span>
        <input
          type="text"
          value={value.name}
          placeholder="Ej.: Vitamina D"
          autoFocus={autoFocus}
          onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
        />
      </div>

      <div class="field">
        <span class="field-label">Dosis habitual (opcional)</span>
        <DecimalField value={value.dose} unit={value.unit} onChange={(dose) => set({ dose })} />
        <input
          type="text"
          value={value.unit}
          placeholder="Unidad: ml, gotas, comprimidos…"
          onInput={(e) => set({ unit: (e.target as HTMLInputElement).value })}
        />
        <p class="field-hint">
          Es la que se propone al registrar; en cada dosis se guarda la que se dio de verdad.
        </p>
      </div>

      <div class="field">
        <span class="field-label">Frecuencia (opcional)</span>
        <input
          type="text"
          value={value.frequency}
          placeholder="Ej.: cada 8 h"
          onInput={(e) => set({ frequency: (e.target as HTMLInputElement).value })}
        />
        {/* La pauta se enseña; no se calcula con ella. Si la aplicación dijera
            "toca ahora", un olvido al anotar la convertiría en una mentira. */}
        <p class="field-hint">
          Se enseña como recordatorio de la pauta. La aplicación no avisa de cuándo toca la
          siguiente: enseña lo registrado, no deduce lo que está pasando.
        </p>
      </div>

      <div class="field">
        <span class="field-label">Tratamiento (opcional)</span>
        <div class="dt-row">
          <input
            type="date"
            aria-label="Desde"
            value={value.from ?? ''}
            onChange={(e) => set({ from: dateValue(e) })}
          />
          <input
            type="date"
            aria-label="Hasta"
            value={value.to ?? ''}
            onChange={(e) => set({ to: dateValue(e) })}
          />
        </div>
        <p class="field-hint">
          Mientras dura, el medicamento aparece al registrar una dosis. Sin fecha de fin no se
          retira solo.
        </p>
      </div>
    </>
  )
}
