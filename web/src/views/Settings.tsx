import { useState } from 'preact/hooks'
import { getApi } from '../api'
import { ApiError } from '../api/types'
import { AmountField, ScreenTitle } from '../components/ui'
import { handleAuthError, navigateReplace, useDay, useNow } from '../hooks'
import { isValidDate } from '../lib/dates'
import { lifeDayNumber } from '../lib/lifeday'
import { showToast } from '../toast'
import type { Goals } from '../types'

interface FormState {
  date: string // 'yyyy-MM-dd'
  time: string // 'HH:mm'
  goals: Goals
}

export function SettingsView() {
  const now = useNow()
  const { data, loading } = useDay(now.slice(0, 10))
  const [state, setState] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  if (!data && loading) {
    return (
      <>
        <ScreenTitle title="Ajustes" />
        <main class="app-main">
          <div class="loading-screen">
            <div class="spinner" />
          </div>
        </main>
      </>
    )
  }

  const settings = data?.settings ?? { birth: null, goals: { pees: 0, poops: 0, milkMl: 0 } }
  const s: FormState = state ?? {
    date: settings.birth ? settings.birth.slice(0, 10) : '',
    time: settings.birth ? settings.birth.slice(11, 16) : '',
    goals: { ...settings.goals },
  }
  const set = (patch: Partial<FormState>) => setState({ ...s, ...patch })
  const setGoals = (patch: Partial<Goals>) => set({ goals: { ...s.goals, ...patch } })

  const birth = s.date && s.time ? `${s.date} ${s.time}` : null
  const problem = birthProblem(s, now)
  const preview = birth && !problem ? lifeDayNumber(birth, now) : null

  async function save() {
    if (problem) return
    setSaving(true)
    try {
      await getApi().updateSettings({ birth, goals: s.goals })
      showToast('Ajustes guardados ✓')
      navigateReplace('#/')
    } catch (err) {
      if (!handleAuthError(err)) {
        showToast(
          err instanceof ApiError ? err.message : 'No se pudieron guardar los ajustes.',
          'error'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ScreenTitle title="Ajustes" />
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
            <div class="card-title">Objetivos del día de vida</div>
            <p class="field-hint">
              Los ponéis vosotros. La aplicación no propone ninguno: solo muestra el progreso
              frente a lo que hayáis decidido. A 0 se oculta el progreso.
            </p>

            <div class="field" style="margin-top:14px">
              <span class="field-label">💧 Pises al día</span>
              <AmountField
                value={s.goals.pees}
                onChange={(pees) => setGoals({ pees })}
                unit="pises"
                presets={[4, 5, 6, 7, 8]}
                max={50}
              />
            </div>

            <div class="field" style="margin-top:14px">
              <span class="field-label">💩 Cacas al día</span>
              <AmountField
                value={s.goals.poops}
                onChange={(poops) => setGoals({ poops })}
                unit="cacas"
                presets={[1, 2, 3, 4, 5]}
                max={50}
              />
            </div>

            <div class="field" style="margin-top:14px">
              <span class="field-label">🥛 Leche cuantificable al día</span>
              <AmountField
                value={s.goals.milkMl}
                onChange={(milkMl) => setGoals({ milkMl })}
                unit="ml"
                presets={[200, 300, 400, 500, 600]}
                max={5000}
              />
              <p class="field-hint">
                Fórmula más leche materna extraída. El pecho directo no cuenta aquí porque no
                sabemos cuántos ml ha tomado.
              </p>
            </div>
          </div>

          <p class="field-hint">Los ajustes son comunes: los ve todo el que usa la aplicación.</p>

          {problem && <div class="banner banner-warn">{problem}</div>}

          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg" disabled={saving || !!problem}>
              {saving ? 'Guardando…' : 'Guardar ajustes'}
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
