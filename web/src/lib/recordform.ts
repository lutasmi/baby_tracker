// Traducción entre el formulario y el modelo de la API.
//
// Vive aquí, separado de la vista, porque es la parte del formulario que puede
// equivocarse en silencio: qué hora se guarda, qué componentes cuentan y qué
// impide guardar. La vista solo pinta este estado.

import type {
  BabyRecord,
  BathKind,
  BreastSide,
  Consistency,
  FeedRecord,
  RecordInput,
  RecordType,
  SleepKind,
} from '../types'
import { addMinutes, diffMinutes, timeOf } from './dates'
import { feedDefaults, guessSleepKind } from './derive'
import { newId } from './records'

/** Cantidades de biberón que se pueden añadir a una toma. */
export type ComponentKey = 'expressed' | 'formula'

/**
 * Una tetada dentro de una toma.
 *
 * Una misma toma puede tener varias —un pecho, luego el otro, y otra vez si se
 * queda con hambre—, y sigue siendo **una sola toma**. Existen mientras se
 * rellena el formulario: a la hoja va el total de minutos y qué pechos se
 * usaron, que es lo que necesitan los contadores.
 */
export interface BreastSession {
  /** Clave local para la lista; no viaja a la API. */
  key: string
  side: BreastSide
  start: string
  end: string
}

export interface FormState {
  start: string
  end: string
  /** Sueño sin cerrar: el cronómetro sigue corriendo. */
  sleepOpen: boolean
  sleepKind: SleepKind
  bathKind: BathKind
  bathDurationMin: number
  sessions: BreastSession[]
  expressedMl: number
  formulaMl: number
  /** Cantidades visibles de la toma, aunque su valor todavía sea 0. */
  active: ComponentKey[]
  pee: boolean
  poop: boolean
  consistency: Consistency | ''
  grams: number
  notes: string
}

/** Margen para relojes desajustados al comprobar que algo no está en el futuro. */
const FUTURE_MARGIN_MIN = 5

/** Cuánto se propone que dure una tetada nueva antes de ajustarla. */
const NEW_SESSION_MIN = 10

export function activeKeysOf(f: { expressedMl: number; formulaMl: number }): ComponentKey[] {
  const keys: ComponentKey[] = []
  if (f.expressedMl > 0) keys.push('expressed')
  if (f.formulaMl > 0) keys.push('formula')
  return keys
}

// --- Tetadas ----------------------------------------------------------------

export function newSession(side: BreastSide, now: string): BreastSession {
  return { key: newId(), side, start: addMinutes(now, -NEW_SESSION_MIN), end: now }
}

/** El pecho que toca: el contrario al de la última tetada. */
export function nextSide(sessions: BreastSession[], fallback: BreastSide | null): BreastSide {
  const last = sessions[sessions.length - 1]?.side ?? fallback
  if (last === 'izquierdo') return 'derecho'
  if (last === 'derecho') return 'izquierdo'
  return last ?? 'izquierdo'
}

export function sessionMinutes(session: BreastSession): number {
  return Math.max(0, diffMinutes(session.start, session.end))
}

/** Minutos de pecho de la toma: la suma de sus tetadas. */
export function breastMinutes(sessions: BreastSession[]): number {
  return sessions.reduce((total, s) => total + sessionMinutes(s), 0)
}

/** Qué pechos se usaron: si hubo de los dos, "ambos". */
export function breastSideOf(sessions: BreastSession[]): BreastSide | null {
  const sides = new Set(sessions.filter((s) => sessionMinutes(s) > 0).map((s) => s.side))
  if (sides.size === 0) return null
  if (sides.size > 1 || sides.has('ambos')) return 'ambos'
  return [...sides][0]
}

/**
 * Horas de la toma derivadas de sus tetadas: empieza con la primera y acaba
 * con la última.
 *
 * Sin tetadas la toma es puntual y el fin es el propio inicio: un biberón se
 * anota "a las 13:13", no "de 13:13 a la hora que fuera cuando lo apuntaste".
 */
export function timesFromSessions(state: FormState): { start: string; end: string } {
  if (state.sessions.length === 0) return { start: state.start, end: state.start }
  const starts = state.sessions.map((s) => s.start)
  const ends = state.sessions.map((s) => s.end)
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end: ends.reduce((a, b) => (a > b ? a : b)),
  }
}

/** Frase que resume lo que se va a guardar. */
export function feedSummary(state: FormState): string {
  const minutes = breastMinutes(state.sessions)
  const ml = effectiveMl(state)
  const { start, end } = timesFromSessions(state)
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} min de pecho`)
  if (ml.expressedMl > 0) parts.push(`${ml.expressedMl} ml de extraída`)
  if (ml.formulaMl > 0) parts.push(`${ml.formulaMl} ml de fórmula`)
  if (parts.length === 0) return ''

  const cuando =
    start === end ? `a las ${timeOf(start)}` : `de ${timeOf(start)} a ${timeOf(end)}`
  return `${parts.join(' · ')} ${cuando}`
}

export function initialState(
  type: RecordType,
  existing: BabyRecord | null,
  lastFeed: FeedRecord | null,
  now: string
): FormState {
  const base: FormState = {
    start: now,
    end: now,
    sleepOpen: false,
    sleepKind: guessSleepKind(now),
    bathKind: 'completo',
    bathDurationMin: 0,
    sessions: [],
    expressedMl: 0,
    formulaMl: 0,
    active: [],
    pee: false,
    poop: false,
    consistency: '',
    grams: 0,
    notes: '',
  }

  if (!existing) {
    switch (type) {
      case 'sleep': {
        const start = addMinutes(now, -60)
        return { ...base, start, end: now, sleepKind: guessSleepKind(start) }
      }
      case 'feed': {
        // Se abre en el caso más simple: un biberón a esta hora. En cuanto se
        // añade una tetada, las horas pasan a salir de ella.
        const defaults = feedDefaults(lastFeed)
        return {
          ...base,
          expressedMl: defaults.expressedMl,
          formulaMl: defaults.formulaMl,
          active: activeKeysOf(defaults),
        }
      }
      case 'diaper':
        return { ...base, pee: true }
      case 'bath':
      case 'weight':
        return base
    }
  }

  const r = existing
  const state: FormState = { ...base, start: r.start, notes: r.notes }
  switch (r.type) {
    case 'sleep':
      return { ...state, end: r.end ?? now, sleepOpen: !r.end, sleepKind: r.kind }
    case 'feed':
      return {
        ...state,
        end: r.end ?? now,
        // De la hoja vuelve el total, no cada tetada: se reconstruye una sola
        // que las resume, y desde ahí se puede corregir o volver a separar.
        sessions:
          r.breastMin > 0
            ? [
                {
                  key: newId(),
                  side: r.breastSide ?? 'ambos',
                  start: r.start,
                  end: addMinutes(r.start, r.breastMin),
                },
              ]
            : [],
        expressedMl: r.expressedMl,
        formulaMl: r.formulaMl,
        active: activeKeysOf(r),
      }
    case 'diaper':
      return { ...state, pee: r.pee, poop: r.poop, consistency: r.consistency ?? '' }
    case 'bath':
      return { ...state, bathKind: r.kind, bathDurationMin: r.durationMin }
    case 'weight':
      return { ...state, grams: r.grams }
  }
}

/** Solo las cantidades visibles cuentan: apagar una la pone a cero. */
export function effectiveMl(s: FormState): { expressedMl: number; formulaMl: number } {
  return {
    expressedMl: s.active.includes('expressed') ? s.expressedMl : 0,
    formulaMl: s.active.includes('formula') ? s.formulaMl : 0,
  }
}

/** Lo que se guarda de una toma: el total de las tetadas y las cantidades. */
export function effectiveFeed(s: FormState): {
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
} {
  return {
    breastMin: breastMinutes(s.sessions),
    breastSide: breastSideOf(s.sessions),
    ...effectiveMl(s),
  }
}

/** Traduce el estado del formulario al registro que viaja a la API. */
export function buildInput(id: string, type: RecordType, s: FormState): RecordInput {
  const common = { id, start: s.start, notes: s.notes.trim() }
  switch (type) {
    case 'sleep':
      return {
        ...common,
        type: 'sleep',
        end: s.sleepOpen ? null : s.end,
        durationMin: s.sleepOpen ? null : diffMinutes(s.start, s.end),
        kind: s.sleepKind,
      }
    case 'feed': {
      // Las horas salen de las tetadas cuando las hay; si no, manda la que se
      // haya puesto a mano y la toma es puntual.
      const { start, end } = timesFromSessions(s)
      return {
        ...common,
        type: 'feed',
        start,
        end,
        durationMin: diffMinutes(start, end),
        ...effectiveFeed(s),
      }
    }
    case 'diaper':
      return {
        ...common,
        type: 'diaper',
        pee: s.pee,
        poop: s.poop,
        // La consistencia solo aplica cuando hay caca.
        consistency: s.poop && s.consistency ? s.consistency : null,
      }
    case 'bath':
      return {
        ...common,
        type: 'bath',
        kind: s.bathKind,
        durationMin: s.bathDurationMin,
      }
    case 'weight':
      return { ...common, type: 'weight', grams: s.grams }
  }
}

/** Motivo por el que no se puede guardar todavía, o null si todo está bien. */
export function validate(type: RecordType, s: FormState, now: string): string | null {
  const margin = FUTURE_MARGIN_MIN
  if (type !== 'feed' && diffMinutes(now, s.start) > margin) {
    return 'La hora de inicio no puede estar en el futuro.'
  }
  if (type === 'feed' && s.sessions.length === 0 && diffMinutes(now, s.start) > margin) {
    return 'La hora no puede estar en el futuro.'
  }

  if (type === 'sleep' && !s.sleepOpen) {
    const dur = diffMinutes(s.start, s.end)
    if (dur <= 0) return 'El fin debe ser posterior al inicio.'
    if (dur > 24 * 60) return 'Un sueño no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
  }

  if (type === 'feed') {
    for (const session of s.sessions) {
      if (diffMinutes(now, session.start) > margin) {
        return 'Una tetada no puede empezar en el futuro.'
      }
      if (diffMinutes(now, session.end) > margin) {
        return 'Una tetada no puede acabar en el futuro.'
      }
      if (sessionMinutes(session) <= 0) return 'Cada tetada tiene que acabar después de empezar.'
    }

    const { start, end } = timesFromSessions(s)
    const dur = diffMinutes(start, end)
    if (dur < 0) return 'El fin no puede ser anterior al inicio.'
    if (dur > 24 * 60) return 'Una toma no puede durar más de 24 horas.'
    if (diffMinutes(now, end) > margin) return 'La hora de fin no puede estar en el futuro.'

    const feed = effectiveFeed(s)
    if (!feed.breastMin && !feed.expressedMl && !feed.formulaMl) {
      return 'Añade una tetada, leche extraída o fórmula.'
    }
  }

  if (type === 'diaper' && !s.pee && !s.poop) {
    return 'Marca si ha habido pis, caca o las dos cosas.'
  }

  if (type === 'weight' && !s.grams) return 'Indica el peso en gramos.'
  return null
}
