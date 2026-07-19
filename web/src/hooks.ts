import { useCallback, useEffect, useState } from 'preact/hooks'
import { getApi } from './api'
import { ApiError } from './api/types'
import { nowMadrid } from './lib/dates'
import { clearSession } from './session'
import { cacheDay, getCachedDay } from './store'
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
      const fresh = await getApi().getDay(date)
      cacheDay(fresh)
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
