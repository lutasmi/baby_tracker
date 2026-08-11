import { useCallback, useEffect, useState } from 'preact/hooks'
import { getApi } from './api'
import { ApiError } from './api/types'
import { nowMadrid } from './lib/dates'
import { clearSession } from './session'
import { loadDayMode, saveDayMode, type DayMode } from './prefs'
import { loadDays } from './lib/dayload'
import { fetchDay, getCachedDay } from './store'
import type { DayData } from './types'

// --- Navegación por hash (el botón atrás del móvil funciona) ---------------

export function useRoute(): string {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export function navigate(path: string): void {
  location.hash = path
}

/** Navega sustituyendo la entrada actual del historial (tras guardar un
 * formulario, el botón atrás no debe volver a él). */
export function navigateReplace(path: string): void {
  const url = new URL(location.href)
  url.hash = path
  location.replace(url.toString())
}

// --- Reloj que avanza (para "lleva despierto 2 h 13 min") ------------------

export function useNow(intervalMs = 30000): string {
  const [now, setNow] = useState(nowMadrid())
  useEffect(() => {
    const update = () => setNow(nowMadrid())
    const id = setInterval(update, intervalMs)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [intervalMs])
  return now
}

// --- Conexión ---------------------------------------------------------------

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// --- Sesión caducada --------------------------------------------------------

/**
 * Si el error es de sesión (caducada o revocada), cierra la sesión local y
 * devuelve true. La App escucha el evento y vuelve a la pantalla de acceso.
 */
export function handleAuthError(err: unknown): boolean {
  if (err instanceof ApiError && (err.code === 'AUTH' || err.code === 'FORBIDDEN')) {
    clearSession()
    window.dispatchEvent(new CustomEvent('babytracker:logout', { detail: err.message }))
    return true
  }
  return false
}

// --- Datos de un día --------------------------------------------------------

export interface DayState {
  data: DayData | null
  loading: boolean
  error: ApiError | null
  reload: () => Promise<void>
}

/**
 * Carga los datos del día. Muestra al instante la última versión cacheada y
 * refresca en segundo plano; también refresca al volver a la aplicación.
 */
export function useDay(date: string): DayState {
  const [data, setData] = useState<DayData | null>(() => getCachedDay(date))
  const [loading, setLoading] = useState(!getCachedDay(date))
  const [error, setError] = useState<ApiError | null>(null)

  const reload = useCallback(async () => {
    try {
      const fresh = await fetchDay(date, (d) => getApi().getDay(d))
      setData(fresh)
      setError(null)
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof ApiError ? err : new ApiError('INTERNAL', 'Error inesperado.'))
      }
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    const cached = getCachedDay(date)
    setData(cached)
    setError(null)
    setLoading(!cached)
    void reload()
  }, [reload, date])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  return { data, loading, error, reload }
}

// --- Calendario elegido -----------------------------------------------------

/** Día de vida o día natural. Se recuerda entre pantallas y entre sesiones. */
export function useDayMode(): [DayMode, (mode: DayMode) => void] {
  const [mode, setMode] = useState<DayMode>(() => loadDayMode())
  return [
    mode,
    (next: DayMode) => {
      saveDayMode(next)
      setMode(next)
    },
  ]
}

// --- Varios días a la vez ---------------------------------------------------

/**
 * Carga los días naturales indicados, aprovechando lo que ya esté en caché.
 * Un día de vida cae casi siempre a caballo de dos días naturales, así que la
 * cronología necesita poder pedir varios de golpe.
 */
export interface DaysState {
  days: DayData[]
  loading: boolean
  /** Fechas que no se pudieron cargar, para decirlo en vez de omitirlas. */
  failed: string[]
  /** Vuelve a pedir solo lo que falló. */
  retry: () => void
}

/**
 * Varios días a la vez. Se piden **en paralelo** y la lista se actualiza según
 * llega cada uno, en lugar de esperar al último: con cuatro días, la diferencia
 * es entre ver algo al segundo o a los doce.
 */
export function useDays(dates: string[]): DaysState {
  const key = dates.join(',')
  const collect = useCallback(
    () => (key ? key.split(',') : []).map(getCachedDay).filter((d): d is DayData => d != null),
    [key]
  )
  const [days, setDays] = useState<DayData[]>(collect)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const wanted = key ? key.split(',') : []
    const missing = wanted.filter((d) => !getCachedDay(d))
    setDays(collect())
    if (missing.length === 0) {
      setFailed([])
      return
    }

    setLoading(true)
    void (async () => {
      const load = await loadDays(
        (d) => fetchDay(d, (fecha) => getApi().getDay(fecha)),
        missing,
        // Cada día que llega se pinta ya, sin esperar a sus compañeros.
        () => {
          if (!cancelled) setDays(collect())
        }
      )
      for (const f of load.failed) handleAuthError(f.error)
      if (!cancelled) {
        setDays(collect())
        setFailed(load.failed.map((f) => f.date))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key, collect, attempt])

  return { days, loading, failed, retry: () => setAttempt((n) => n + 1) }
}
