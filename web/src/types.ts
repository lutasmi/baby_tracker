// Modelo de datos de la aplicación. Toda la app gira alrededor del Evento.
// Las fechas-hora son siempre hora local de Madrid en formato 'yyyy-MM-dd HH:mm'.

export type EventType = 'sleep' | 'feed' | 'diaper' | 'bath'

// Subtipos por tipo:
//   sleep:  'siesta' | 'nocturno'
//   feed:   'biberon' | 'lactancia' | 'mixta'   (derivado de los componentes)
//   diaper: 'pipi' | 'caca' | 'ambos'
//   bath:   'completo' | 'aseo'
// Detalle (detail) por tipo:
//   feed:   'materna' | 'formula' | 'mixta' | lado del pecho (compatibilidad)
//   diaper: 'liquida' | 'pastosa' | 'solida'  (consistencia, solo con caca)

/**
 * Desglose de una toma. Una misma toma puede combinar pecho directo, leche
 * materna extraída y fórmula. Los minutos de pecho y los ml son magnitudes
 * distintas y nunca se convierten entre sí.
 *
 * `mixtaMl` solo existe en registros creados con la v1, donde el biberón
 * "mixto" guardaba el total sin decir cuánto era de cada tipo.
 */
export interface FeedComponents {
  breastMin: number
  breastSide: string | null
  expressedMl: number
  formulaMl: number
  mixtaMl: number
}

export interface BabyEvent {
  id: string
  type: EventType
  subtype: string
  start: string // 'yyyy-MM-dd HH:mm'
  end: string | null // null en un sueño sin cerrar
  durationMin: number | null // derivada de inicio y fin; manual en baños
  quantityMl: number | null // total de ml cuantificables de una toma
  detail: string | null
  components: FeedComponents | null // solo en las tomas
  notes: string
  createdBy: string // email
  createdAt: string
  updatedBy: string | null
  updatedAt: string | null
}

export interface User {
  email: string
  name: string
}

// --- Ajustes compartidos ----------------------------------------------------

/** Un objetivo a 0 significa "sin objetivo": no se muestra progreso. */
export interface Goals {
  pees: number
  poops: number
  milkMl: number
}

export interface Settings {
  birth: string | null // 'yyyy-MM-dd HH:mm'
  goals: Goals
}

// --- Día de vida ------------------------------------------------------------

export interface LifeDayTotals {
  pees: number
  poops: number
  diapers: number
  feeds: number
  breastMin: number
  expressedMl: number
  formulaMl: number
  mixtaMl: number
  milkMl: number // fórmula + extraída + mixta; el pecho directo no es cuantificable
}

/** Periodo de 24 h contado desde la hora exacta de nacimiento. */
export interface LifeDay {
  number: number
  start: string
  end: string // exclusivo
  totals: LifeDayTotals
}

// Respuesta de la API para un día concreto.
export interface DayData {
  date: string // 'yyyy-MM-dd'
  // Eventos cuyo intervalo toca el día (incluye el sueño nocturno que empezó ayer).
  events: BabyEvent[]
  // Sueño sin cerrar, sea del día que sea. No implica que el bebé siga dormido:
  // puede ser un cronómetro que se olvidó de detener.
  activeSleep: BabyEvent | null
  // Últimos eventos globales, independientes del día consultado.
  last: {
    feed: BabyEvent | null
    diaper: BabyEvent | null
    sleepEnd: BabyEvent | null // último sueño finalizado
  }
  users: Record<string, string> // email -> nombre visible
  serverNow: string // 'yyyy-MM-dd HH:mm' hora de Madrid del servidor
  settings: Settings
  lifeDay: LifeDay | null // null mientras no haya fecha de nacimiento
}

// Datos que viajan al crear o editar un evento. El cliente genera el id
// (UUID) antes de enviar: reintentar una petición nunca crea duplicados.
export interface EventInput {
  id: string
  type: EventType
  subtype: string
  start: string
  end: string | null
  durationMin: number | null
  quantityMl: number | null
  detail: string | null
  components: FeedComponents | null
  notes: string
}
