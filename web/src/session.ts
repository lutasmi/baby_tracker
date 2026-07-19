// Sesión persistida en localStorage. El token es opaco: lo emite el backend
// tras verificar el inicio de sesión con Google y caduca en el servidor.

import type { User } from './types'

const KEY = 'babytracker.session'

export interface Session {
  token: string
  user: User
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s.token && s.user?.email ? s : null
  } catch {
    return null
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession(): void {
  localStorage.removeItem(KEY)
}
