// Traducción entre el formulario de eventos y el modelo de la API.
//
// Vive aquí, separado de la vista, porque es la parte del formulario que puede
// equivocarse en silencio: qué hora se guarda, qué componentes cuentan y qué
// impide guardar. La vista solo pinta este estado.

import type { BabyEvent, EventInput, EventType, FeedComponents } from '../types'
import { addMinutes, diffMinutes } from './dates'
import { feedDefaults, guessSleepSubtype } from './derive'
import { componentsOf, emptyComponents, feedSubtypeFor, isEmpty, quantifiableMl } from './feed'

/** Componentes que se pueden añadir a una toma. */
export type ComponentKey = 'breast' | 'expressed' | 'formula' | 'mixta'

export interface FormState {
  subtype: string
  start: string
  end: string
  /** Sueño sin cerrar: el cronómetro sigue corriendo. */
  sleepOpen: boolean
  components: FeedComponents
  /** Componentes visibles de la toma, aunque su valor todavía sea 0. */
  active: ComponentKey[]
  durationMin: number
  consistency: string
  notes: string
}

/** Margen para relojes desajustados al comprobar que algo no está en el futuro. */
const FUTURE_MARGIN_MIN = 5

export function activeKeysOf(c: FeedComponents): ComponentKey[] {
  const keys: ComponentKey[] = []
  if (c.breastMin > 0) keys.push('breast')
  if (c.expressedMl > 0) keys.push('expressed')
  if (c.formulaMl > 0) keys.push('formula')
  if (c.mixtaMl > 0) keys.push('mixta')
  return keys
}

export function initialState(
  kind: EventType,
  existing: BabyEvent | null,
  lastFeed: BabyEvent | null,
  now: string
): FormState {
  const base: FormState = {
    subtype: '',
    start: now,
    end: now,
    sleepOpen: false,
    components: emptyComponents(),
    active: [],
    durationMin: 0,
    consistency: '',
    notes: '',
  }

  if (!existing) {
    switch (kind) {
      case 'sleep': {
        const start = addMinutes(now, -60)
        return { ...base, subtype: guessSleepSubtype(start), start, end: now }
      }
      case 'feed': {
        // Lo habitual es anotar la toma justo después de terminarla.
        const components = feedDefaults(lastFeed)
        return {
          ...base,
          start: addMinutes(now, -15),
          end: now,
          components,
          active: activeKeysOf(components),
        }
      }
      case 'diaper':
        return { ...base, subtype: 'pipi' }
      case 'bath':
        return { ...base, subtype: 'completo' }
    }
  }

  const e = existing
  const components = componentsOf(e)
  return {
    ...base,
    subtype: e.subtype,
    start: e.start,
    end: e.end ?? now,
    sleepOpen: e.type === 'sleep' && !e.end,
    components,
    active: activeKeysOf(components),
    durationMin: e.type === 'bath' ? (e.durationMin ?? 0) : 0,
    consistency: e.type === 'diaper' ? (e.detail ?? '') : '',
    notes: e.notes,
  }
}

/** Solo los componentes visibles cuentan: apagar uno lo pone a cero. */
export function effectiveComponents(s: FormState): FeedComponents {
  const c = emptyComponents()
  if (s.active.includes('breast')) {
    c.breastMin = s.components.breastMin
    c.breastSide = s.components.breastSide
  }
  if (s.active.includes('expressed')) c.expressedMl = s.components.expressedMl
  if (s.active.includes('formula')) c.formulaMl = s.components.formulaMl
  if (s.active.includes('mixta')) c.mixtaMl = s.components.mixtaMl
  return c
}

/** Traduce el estado del formulario al evento que viaja a la API. */
export function buildInput(id: string, kind: EventType, s: FormState): EventInput {
  const base = {
    id,
    type: kind,
    subtype: s.subtype,
    start: s.start,
    end: null as string | null,
    durationMin: null as number | null,
    quantityMl: null as number | null,
    detail: null as string | null,
    components: null as FeedComponents | null,
    notes: s.notes.trim(),
  }
  switch (kind) {
    case 'sleep':
      return { ...base, end: s.sleepOpen ? null : s.end }
    case 'feed': {
      const components = effectiveComponents(s)
      return {
        ...base,
        // El backend recalcula el subtipo; se envía por coherencia del modelo.
        subtype: feedSubtypeFor(components),
        end: s.end,
        components,
        quantityMl: quantifiableMl(components) || null,
      }
    }
    case 'diaper':
      return { ...base, detail: s.subtype !== 'pipi' && s.consistency ? s.consistency : null }
    case 'bath':
      return { ...base, durationMin: s.durationMin > 0 ? s.durationMin : null }
  }
}

/** Motivo por el que no se puede guardar todavía, o null si todo está bien. */
export function validate(kind: EventType, s: FormState, now: string): string | null {
  const margin = FUTURE_MARGIN_MIN
  if (diffMinutes(now, s.start) > margin) return 'La hora de inicio no puede estar en el futuro.'

  if (kind === 'sleep' && !s.sleepOpen) {
    const dur = diffMinutes(s.start, s.end)
    if (dur <= 0) return 'El fin debe ser posterior al inicio.'
    if (dur > 24 * 60) return 'Un sueño no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
  }

  if (kind === 'feed') {
    const dur = diffMinutes(s.start, s.end)
    if (dur < 0) return 'El fin no puede ser anterior al inicio.'
    if (dur > 24 * 60) return 'Una toma no puede durar más de 24 horas.'
    if (diffMinutes(now, s.end) > margin) return 'La hora de fin no puede estar en el futuro.'
    const c = effectiveComponents(s)
    if (isEmpty(c)) return 'Añade al menos pecho, leche extraída o fórmula.'
    if (c.breastMin > dur + margin) {
      return 'Los minutos de pecho no pueden superar la duración de la toma.'
    }
  }
  return null
}
