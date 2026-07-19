// Cliente de la API real (Google Apps Script).

import { loadSession } from '../session'
import type { BabyEvent, DayData, EventInput, User } from '../types'
import { ApiError, type Api, type ApiErrorCode } from './types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const TIMEOUT_MS = 30000

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
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
    throw new ApiError('NETWORK', `El servidor respondió con un error (${res.status}).`)
  }

  let body: { ok: boolean; data?: T; error?: { code?: string; message?: string } }
  try {
    body = await res.json()
  } catch {
    throw new ApiError('INTERNAL', 'El servidor devolvió una respuesta no válida.')
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
  createEvent(input: EventInput) {
    return call<BabyEvent>('createEvent', { event: input })
  },
  updateEvent(input: EventInput) {
    return call<BabyEvent>('updateEvent', { event: input })
  },
  async deleteEvent(id: string) {
    await call('deleteEvent', { id })
  },
}
