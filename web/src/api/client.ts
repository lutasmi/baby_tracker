// Cliente de la API real (Google Apps Script).

import { loadSession } from '../session'
import type {
  BabyRecord,
  DayData,
  History,
  RecordInput,
  RecordType,
  Settings,
  User,
} from '../types'
import { ApiError, type Api, type ApiErrorCode } from './types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const TIMEOUT_MS = 30000

/**
 * Esperas entre reintentos, en milisegundos. Apps Script falla de vez en
 * cuando por causas pasajeras —cuota momentánea, un pico de latencia, la red
 * del móvil cambiando de antena— y hoy cualquiera de esas se le muestra al
 * usuario como un error.
 *
 * Reintentar es seguro incluso escribiendo: el identificador lo genera el
 * móvil antes de enviar, así que la segunda petición devuelve lo ya guardado
 * en vez de duplicarlo.
 */
const RETRY_DELAYS_MS = [400, 1200]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let lastError: unknown
  for (let intento = 0; intento <= RETRY_DELAYS_MS.length; intento++) {
    if (intento > 0) await wait(RETRY_DELAYS_MS[intento - 1])
    try {
      return await callOnce<T>(action, payload)
    } catch (err) {
      lastError = err
      // Un error de validación o de sesión no mejora por repetirlo.
      if (!(err instanceof ApiError) || !err.retryable) throw err
      // Sin red no hay nada que reintentar: mejor decirlo ya que hacer
      // esperar dos segundos para el mismo resultado.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err
    }
  }
  throw lastError
}

async function callOnce<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!API_URL) {
    throw new ApiError('CONFIG', 'Falta configurar la URL de la API (VITE_API_URL).')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      // text/plain mantiene la petición "simple" y evita el preflight CORS,
      // que Apps Script no responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: loadSession()?.token ?? null, ...payload }),
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch {
    throw new ApiError('NETWORK', 'No hay conexión con el servidor. Reinténtalo.')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // 5xx y 429 son pasajeros; un 4xx no mejora repitiéndolo.
    const pasajero = res.status >= 500 || res.status === 429
    throw new ApiError(
      'NETWORK',
      `El servidor respondió con un error (${res.status}).`,
      pasajero
    )
  }

  let body: { ok: boolean; data?: T; error?: { code?: string; message?: string } }
  try {
    body = await res.json()
  } catch {
    // Apps Script devuelve HTML cuando la implementación no está lista: puede
    // ser momentáneo mientras se publica una versión.
    throw new ApiError('INTERNAL', 'El servidor devolvió una respuesta no válida.', true)
  }
  if (!body.ok) {
    throw new ApiError(
      (body.error?.code as ApiErrorCode) ?? 'INTERNAL',
      body.error?.message ?? 'Error inesperado del servidor.'
    )
  }
  return body.data as T
}

export const realApi: Api = {
  login(idToken: string) {
    return call<{ token: string; user: User }>('login', { idToken })
  },
  async logout() {
    await call('logout')
  },
  getDay(date: string) {
    return call<DayData>('getDay', { date })
  },
  getHistory(days: number) {
    return call<History>('getHistory', { days })
  },
  createRecord(input: RecordInput) {
    return call<BabyRecord>('createRecord', { record: input })
  },
  updateRecord(input: RecordInput) {
    return call<BabyRecord>('updateRecord', { record: input })
  },
  async deleteRecord(type: RecordType, id: string) {
    await call('deleteRecord', { type, id })
  },
  updateSettings(settings: Settings) {
    return call<Settings>('updateSettings', { settings })
  },
}
