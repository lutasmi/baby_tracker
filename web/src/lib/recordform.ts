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
  PeeAmount,
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
  peeAmount: PeeAmount | ''
  consistency: Consistency | ''
  /**
   * Las horas de la toma están puestas a mano en lugar de salir de las
   * tetadas. Pasa al pedir la hora de fin de un biberón, al ajustar el final
   * porque después vino un biberón, y al reabrir una toma cuyo intervalo no
   * coincide con la suma de sus tetadas.
   */
  manualTimes: boolean
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

/**
 * Qué pechos se usaron en la toma.
 *
 * Con tetadas de los dos lados es "ambos". Si alguna quedó sin anotar, el
 * resultado es "no recuerdo" salvo que las conocidas ya sumen los dos pechos:
 * media respuesta no autoriza a inventar la otra media.
 */
export function breastSideOf(sessions: BreastSession[]): BreastSide | null {
  const sides = new Set(sessions.filter((s) => sessionMinutes(s) > 0).map((s) => s.side))
  if (sides.size === 0) return null

  const unknown = sides.delete('desconocido')
  if (sides.has('ambos') || (sides.has('izquierdo') && sides.has('derecho'))) return 'ambos'
  if (unknown || sides.size === 0) return 'desconocido'
  return [...sides][0]
}

/**
 * Horas de la toma: salen de sus tetadas —de la primera a la última— salvo que
 * se hayan puesto a mano.
 *
 * Sin tetadas la toma es puntual y el fin es el propio inicio: un biberón se
 * anota "a las 13:13", no "de 13:13 a la hora que fuera cuando lo apuntaste".
 */
export function feedTimes(state: FormState): { start: string; end: string } {
  if (state.manualTimes) return { start: state.start, end: state.end }
  if (state.sessions.length === 0) return { start: state.start, end: state.start }
  return sessionSpan(state.sessions)
}

/** De la primera tetada a la última. */
export function sessionSpan(sessions: BreastSession[]): { start: string; end: string } {
  return {
    start: sessions.map((s) => s.start).reduce((a, b) => (a < b ? a : b)),
    end: sessions.map((s) => s.end).reduce((a, b) => (a > b ? a : b)),
  }
}

/** Frase que resume lo que se va a guardar. */
export function feedSummary(state: FormState): string {
  const minutes = breastMinutes(state.sessions)
  const ml = effectiveMl(state)
  const { start, end } = feedTimes(state)
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
    peeAmount: '',
    consistency: '',
    manualTimes: false,
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
    case 'feed': {
      // De la hoja vuelve el total, no cada tetada: se reconstruye una sola
      // que las resume, y desde ahí se puede corregir o volver a separar.
      const sessions =
        r.breastMin > 0
          ? [
              {
                key: newId(),
                side: r.breastSide ?? 'ambos',
                start: r.start,
                end: addMinutes(r.start, r.breastMin),
              },
            ]
          : []
      // Si el intervalo guardado no coincide con el de esa tetada resumen
      // —porque hubo pausas, o un biberón después—, mandan las horas
      // guardadas: reabrir y guardar sin tocar nada no puede recortar la toma.
      const derivedEnd = sessions.length > 0 ? sessions[0].end : r.start
      return {
        ...state,
        end: r.end ?? now,
        sessions,
        expressedMl: r.expressedMl,
        formulaMl: r.formulaMl,
        active: activeKeysOf(r),
        manualTimes: (r.end ?? r.start) !== derivedEnd,
      }
    }
    case 'diaper':
      return {
        ...state,
        pee: r.pee,
        poop: r.poop,
        peeAmount: r.peeAmount ?? '',
        consistency: r.consistency ?? '',
      }
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
      const { start, end } = feedTimes(s)
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
        // Cada detalle solo viaja si hubo aquello a lo que se refiere.
        peeAmount: s.pee && s.peeAmount ? s.peeAmount : null,
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

    const { start, end } = feedTimes(s)
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
