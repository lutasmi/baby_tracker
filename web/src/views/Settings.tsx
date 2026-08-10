import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { AmountField, ScreenTitle } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { isValidDate } from '../lib/dates'
import { lifeDayNumber } from '../lib/lifeday'
import { formatKg } from '../lib/records'
import { showToast } from '../toast'

interface FormState {
  date: string // 'yyyy-MM-dd'
  time: string // 'HH:mm'
  birthWeightG: number
}

export function SettingsView() {
  const now = useNow()
  const { data, loading } = useDay(now.slice(0, 10))
  const [state, setState] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  if (!data && loading) {
    return (
      <>
        <ScreenTitle title="Datos del bebé" />
        <main class="app-main">
          <div class="loading-screen">
            <div class="spinner" />
          </div>
        </main>
      </>
    )
  }

  const settings = data?.settings ?? { birth: null, birthWeightG: 0 }
  const s: FormState = state ?? {
    date: settings.birth ? settings.birth.slice(0, 10) : '',
    time: settings.birth ? settings.birth.slice(11, 16) : '',
    birthWeightG: settings.birthWeightG,
  }
  const set = (patch: Partial<FormState>) => setState({ ...s, ...patch })

  const birth = s.date && s.time ? `${s.date} ${s.time}` : null
  const problem = birthProblem(s, now)
  const preview = birth && !problem ? lifeDayNumber(birth, now) : null

  async function save() {
    if (problem) return
    setSaving(true)
    try {
      await getApi().updateSettings({ birth, birthWeightG: s.birthWeightG })
      showToast('Guardado ✓')
      navigateReplace('#/')
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(
          err instanceof ApiError ? err.message : 'No se pudieron guardar los datos.',
          'error'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ScreenTitle title="Datos del bebé" />
      <main class="app-main">
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div class="card">
            <div class="card-title">Nacimiento</div>
            <p class="field-hint">
              La hora exacta define los días de vida: periodos de 24 h contados desde el
              nacimiento, no desde medianoche.
            </p>
            <div class="dt-row" style="margin-top:10px">
              <input
                type="date"
                value={s.date}
                max={now.slice(0, 10)}
                onChange={(e) => set({ date: (e.target as HTMLInputElement).value })}
              />
              <input
                type="time"
                value={s.time}
                onChange={(e) => set({ time: (e.target as HTMLInputElement).value })}
              />
            </div>
            {preview != null && preview > 0 && (
              <p class="field-hint" style="margin-top:10px">
                Ahora mismo sería el <strong>día de vida {preview}</strong>.
              </p>
            )}
          </div>

          <div class="card">
            <div class="card-title">Peso al nacer</div>
            <p class="field-hint">
              Es la referencia con la que se compara cada pesada. Sin él se sigue pudiendo
              registrar el peso, pero no la variación.
            </p>
            <div style="margin-top:14px">
              <AmountField
                value={s.birthWeightG}
                onChange={(birthWeightG) => set({ birthWeightG })}
                unit="g"
                max={30000}
                step={10}
              />
              {s.birthWeightG > 0 && (
                <p class="field-hint">= {formatKg(s.birthWeightG)}</p>
              )}
            </div>
          </div>

          <p class="field-hint">Estos datos son comunes: los ve todo el que usa la aplicación.</p>

          {problem && <div class="banner banner-warn">{problem}</div>}

          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg" disabled={saving || !!problem}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}

function birthProblem(s: FormState, now: string): string | null {
  if (!s.date && !s.time) return null
  if (!s.date || !s.time) return 'Indica la fecha y la hora de nacimiento.'
  if (!isValidDate(s.date)) return 'La fecha de nacimiento no es válida.'
  if (`${s.date} ${s.time}` > now) return 'El nacimiento no puede estar en el futuro.'
  return null
}
