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
import { addMinutes, diffMinutes } from './dates'
import { feedDefaults, guessSleepKind } from './derive'
import { feedIsEmpty } from './records'

/** Componentes que se pueden añadir a una toma. */
export type ComponentKey = 'breast' | 'expressed' | 'formula'

export interface FormState {
  start: string
  end: string
  /** Sueño sin cerrar: el cronómetro sigue corriendo. */
  sleepOpen: boolean
  sleepKind: SleepKind
  bathKind: BathKind
  bathDurationMin: number
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
  /** Componentes visibles de la toma, aunque su valor todavía sea 0. */
  active: ComponentKey[]
  pee: boolean
  poop: boolean
  consistency: Consistency | ''
  grams: number
  notes: string
}

/** Margen para relojes desajustados al comprobar que algo no está en el futuro. */
const FUTURE_MARGIN_MIN = 5

export function activeKeysOf(f: {
  breastMin: number
  expressedMl: number
  formulaMl: number
}): ComponentKey[] {
  const keys: ComponentKey[] = []
  if (f.breastMin > 0) keys.push('breast')
  if (f.expressedMl > 0) keys.push('expressed')
  if (f.formulaMl > 0) keys.push('formula')
  return keys
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
    breastMin: 0,
    breastSide: null,
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
        // Lo habitual es anotar la toma justo después de terminarla.
        const defaults = feedDefaults(lastFeed)
        return {
          ...base,
          start: addMinutes(now, -15),
          end: now,
          ...defaults,
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
        breastMin: r.breastMin,
        breastSide: r.breastSide,
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

/** Solo los componentes visibles cuentan: apagar uno lo pone a cero. */
export function effectiveFeed(s: FormState): {
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
} {
  const breast = s.active.includes('breast')
  return {
    breastMin: breast ? s.breastMin : 0,
    breastSide: breast ? s.breastSide : null,
    expressedMl: s.active.includes('expressed') ? s.expressedMl : 0,
    formulaMl: s.active.includes('formula') ? s.formulaMl : 0,
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
    case 'feed':
      return {
        ...common,
        type: 'feed',
        end: s.end,
        durationMin: diffMinutes(s.start, s.end),
        ...effectiveFeed(s),
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
  if (diffMinutes(now, s.start) > margin) return 'La hora de inicio no puede estar en el futuro.'

  if (type === 'sleep' && !s.sleepOpen) {
    const dur = diffMinutes(s.start, s.end)
    if (dur <= 0) return 'El fin debe ser posterior al inicio.'
    if (dur > 24 * 60) return 'Un sueño no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
  }

  if (type === 'feed') {
    const dur = diffMinutes(s.start, s.end)
    if (dur < 0) return 'El fin no puede ser anterior al inicio.'
    if (dur > 24 * 60) return 'Una toma no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
    const feed = effectiveFeed(s)
    if (feedIsEmpty(feed)) return 'Añade al menos pecho, leche extraída o fórmula.'
    if (feed.breastMin > dur + margin) {
      return 'Los minutos de pecho no pueden superar la duración de la toma.'
    }
  }

  if (type === 'diaper' && !s.pee && !s.poop) {
    return 'Marca si ha habido pis, caca o las dos cosas.'
  }

  if (type === 'weight' && !s.grams) return 'Indica el peso en gramos.'
  return null
}
