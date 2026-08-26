import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { MedicationFields } from '../components/MedicationFields'
import { ScreenTitle } from '../components/ui'
import { handleAuthError, useDay, useNow } from '../hooks'
import {
  emptyMedication,
  formatDose,
  isActiveOn,
  medicationProblem,
  treatmentLabel,
} from '../lib/medications'
import { newId } from '../lib/records'
import { showToast } from '../toast'
import type { Medication } from '../types'

/**
 * El catálogo de medicación: la lista de la que se elige al registrar una
 * dosis.
 *
 * Cuelga de Ajustes porque se toca de tarde en tarde —cuando el pediatra
 * receta algo o cuando se acaba un tratamiento—, no varias veces al día. Lo
 * que sí es de todos los días, registrar la dosis, tiene su propio botón en la
 * pantalla principal.
 */
export function MedicationsView() {
  const now = useNow()
  const today = now.slice(0, 10)
  const { data, loading, reload } = useDay(today)
  const [editing, setEditing] = useState<Medication | null>(null)
  const [saving, setSaving] = useState(false)

  const meds = data?.medications ?? []

  async function save() {
    if (!editing) return
    const problem = medicationProblem(editing)
    if (problem) {
      showToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      await getApi().saveMedication({ ...editing, name: editing.name.trim() })
      showToast('Guardado ✓')
      setEditing(null)
      await reload()
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo guardar.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(m: Medication) {
    const aviso = `¿Quitar ${m.name} de la lista? Las dosis ya registradas se quedan como están.`
    if (!confirm(aviso)) return
    setSaving(true)
    try {
      await getApi().deleteMedication(m.id)
      showToast('Medicamento retirado')
      setEditing(null)
      await reload()
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(err instanceof ApiError ? err.message : 'No se pudo quitar.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const existe = meds.some((m) => m.id === editing.id)
    return (
      <>
        <ScreenTitle title={existe ? 'Editar medicamento' : 'Nuevo medicamento'} />
        <main class="app-main">
          <form
            class="form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <MedicationFields value={editing} onChange={setEditing} autoFocus={!existe} />
            <div class="form-actions">
              {existe && (
                <button
                  type="button"
                  class="btn btn-danger"
                  disabled={saving}
                  onClick={() => void remove(editing)}
                >
                  Quitar
                </button>
              )}
              <button type="submit" class="btn btn-primary btn-lg" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <button type="button" class="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </form>
        </main>
      </>
    )
  }

  return (
    <>
      <ScreenTitle title="Medicación" />
      <main class="app-main">
        {!data && loading ? (
          <div class="loading-screen">
            <div class="spinner" />
          </div>
        ) : (
          <>
            {meds.length === 0 ? (
              <div class="empty-state">
                <span class="icon">💊</span>
                <p>
                  Aquí se guardan los medicamentos del bebé, con su dosis y su pauta. Una vez
                  añadidos, registrar una dosis es elegir de la lista.
                </p>
              </div>
            ) : (
              meds.map((m) => (
                <button key={m.id} class="card med-row" onClick={() => setEditing(m)}>
                  <span class="med-name">
                    {m.name}
                    {/* Un tratamiento terminado no se borra: sigue explicando
                        las dosis de la cronología. Solo deja de proponerse. */}
                    {!isActiveOn(m, today) && <span class="med-tag">no está en curso</span>}
                  </span>
                  <span class="med-meta">
                    {[formatDose(m.dose, m.unit), m.frequency, treatmentLabel(m)]
                      .filter(Boolean)
                      .join(' · ') || 'Sin dosis ni pauta'}
                  </span>
                  <span class="stat-edit">›</span>
                </button>
              ))
            )}

            <button
              class="btn btn-primary btn-lg"
              onClick={() => setEditing(emptyMedication(newId()))}
            >
              + Añadir medicamento
            </button>

            <p class="field-hint">
              La lista es común: la ve todo el que usa la aplicación. También se puede editar a
              mano en la pestaña <strong>Medicamentos</strong> de la hoja de cálculo.
            </p>
          </>
        )}
      </main>
    </>
  )
}
