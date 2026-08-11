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
  FeedItem,
  FeedItemKind,
  FeedRecord,
  Amount,
  RecordInput,
  RecordType,
  SleepKind,
} from '../types'
import { addMinutes, diffMinutes, timeOf } from './dates'
import { feedDefaults, guessSleepKind } from './derive'
import { breastMinutesOf, feedSpan, itemMinutes, mlOfItems, newId } from './records'

export interface FormState {
  start: string
  end: string
  /** Sueño sin cerrar: el cronómetro sigue corriendo. */
  sleepOpen: boolean
  sleepKind: SleepKind
  bathKind: BathKind
  bathDurationMin: number
  /**
   * Lo que ha pasado dentro de la toma: cada tetada y cada biberón, con su
   * hora. Son los mismos elementos que se guardan, uno por fila en la hoja, y
   * de ellos salen el intervalo y los totales de la toma.
   */
  items: FeedItem[]
  pee: boolean
  poop: boolean
  peeAmount: Amount | ''
  poopAmount: Amount | ''
  consistency: Consistency | ''
  grams: number
  notes: string
}

/** Margen para relojes desajustados al comprobar que algo no está en el futuro. */
const FUTURE_MARGIN_MIN = 5

/** Cuánto se propone que dure una tetada nueva antes de ajustarla. */
const NEW_SESSION_MIN = 10

// --- Elementos de la toma ----------------------------------------------------

/** Una tetada nueva: acaba ahora y se propone que empezó hace un rato. */
export function newBreastItem(side: BreastSide, now: string): FeedItem {
  return {
    id: newId(),
    kind: 'pecho',
    side,
    start: addMinutes(now, -NEW_SESSION_MIN),
    end: now,
    ml: 0,
  }
}

/** Un biberón nuevo: puntual, a esta hora, con la cantidad de costumbre. */
export function newBottleItem(kind: FeedItemKind, ml: number, now: string): FeedItem {
  return { id: newId(), kind, side: null, start: now, end: null, ml }
}

export function breastItems(items: FeedItem[]): FeedItem[] {
  return items.filter((i) => i.kind === 'pecho')
}

export function bottleItems(items: FeedItem[]): FeedItem[] {
  return items.filter((i) => i.kind !== 'pecho')
}

/** El pecho que toca: el contrario al de la última tetada. */
export function nextSide(items: FeedItem[], fallback: BreastSide | null): BreastSide {
  const breast = breastItems(items)
  const last = breast[breast.length - 1]?.side ?? fallback
  if (last === 'izquierdo') return 'derecho'
  if (last === 'derecho') return 'izquierdo'
  return last ?? 'izquierdo'
}

/**
 * Horas de la toma: del primer elemento al último.
 *
 * Con un solo biberón sin hora de fin la toma es puntual —se anota "a las
 * 13:13", no "de 13:13 a la hora que fuera cuando lo apuntaste"—, y en cuanto
 * hay una tetada o una hora de fin, el intervalo sale solo.
 */
export function feedTimes(state: FormState): { start: string; end: string } {
  if (state.items.length === 0) return { start: state.start, end: state.start }
  return feedSpan(state.items)
}

/** Frase que resume lo que se va a guardar. */
export function feedSummary(state: FormState): string {
  const minutes = breastMinutesOf(state.items)
  const expressedMl = mlOfItems(state.items, 'extraida')
  const formulaMl = mlOfItems(state.items, 'formula')
  const { start, end } = feedTimes(state)
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} min de pecho`)
  if (expressedMl > 0) parts.push(`${expressedMl} ml de extraída`)
  if (formulaMl > 0) parts.push(`${formulaMl} ml de fórmula`)
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
    items: [],
    pee: false,
    poop: false,
    peeAmount: '',
    poopAmount: '',
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
        // Se abre con los biberones de la toma anterior, que es casi siempre lo
        // que toca. Las tetadas no se proponen: sus horas serían inventadas.
        const defaults = feedDefaults(lastFeed)
        const items: FeedItem[] = []
        if (defaults.expressedMl > 0) {
          items.push(newBottleItem('extraida', defaults.expressedMl, now))
        }
        if (defaults.formulaMl > 0) items.push(newBottleItem('formula', defaults.formulaMl, now))
        return { ...base, items }
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
    // Cada elemento vuelve tal y como se guardó, con su hora: editar una toma
    // es editar lo que pasó dentro, no un total del que ya no se puede volver.
    case 'feed':
      return { ...state, end: r.end ?? now, items: r.items }
    case 'diaper':
      return {
        ...state,
        pee: r.pee,
        poop: r.poop,
        peeAmount: r.peeAmount ?? '',
        poopAmount: r.poopAmount ?? '',
        consistency: r.consistency ?? '',
      }
    case 'bath':
      return { ...state, bathKind: r.kind, bathDurationMin: r.durationMin }
    case 'weight':
      return { ...state, grams: r.grams }
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
    // De la toma solo viajan sus elementos: el intervalo y los totales los
    // deriva el servidor de ellos y así no pueden contradecirlos.
    case 'feed':
      return { id, type: 'feed', notes: s.notes.trim(), items: s.items }
    case 'diaper':
      return {
        ...common,
        type: 'diaper',
        pee: s.pee,
        poop: s.poop,
        // Cada detalle solo viaja si hubo aquello a lo que se refiere.
        peeAmount: s.pee && s.peeAmount ? s.peeAmount : null,
        poopAmount: s.poop && s.poopAmount ? s.poopAmount : null,
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

  if (type === 'sleep' && !s.sleepOpen) {
    const dur = diffMinutes(s.start, s.end)
    if (dur <= 0) return 'El fin debe ser posterior al inicio.'
    if (dur > 24 * 60) return 'Un sueño no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
  }

  if (type === 'feed') {
    if (s.items.length === 0) return 'Añade una tetada o un biberón.'

    for (const item of s.items) {
      const esTetada = item.kind === 'pecho'
      if (diffMinutes(now, item.start) > margin) {
        return esTetada
          ? 'Una tetada no puede empezar en el futuro.'
          : 'Un biberón no puede ser en el futuro.'
      }
      if (item.end && diffMinutes(now, item.end) > margin) {
        return 'La hora de fin no puede estar en el futuro.'
      }
      if (item.end && diffMinutes(item.start, item.end) < 0) {
        return 'El fin no puede ser anterior al inicio.'
      }
      if (esTetada && itemMinutes(item) <= 0) {
        return 'Cada tetada tiene que acabar después de empezar.'
      }
      if (!esTetada && item.ml <= 0) return 'Indica cuántos mililitros lleva el biberón.'
    }

    const { start, end } = feedTimes(s)
    if (diffMinutes(start, end) > 24 * 60) return 'Una toma no puede durar más de 24 horas.'
  }

  if (type === 'diaper' && !s.pee && !s.poop) {
    return 'Marca si ha habido pis, caca o las dos cosas.'
  }

  if (type === 'weight' && !s.grams) return 'Indica el peso en gramos.'
  return null
}
