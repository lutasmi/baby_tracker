// Modelo de datos de la aplicación.
//
// Cada tipo de registro tiene su propia forma y su propia pestaña en la hoja
// de cálculo. En TypeScript eso se traduce en una unión discriminada por
// `type`: un pañal no tiene duración y una toma no tiene consistencia, y el
// compilador lo sabe.
//
// Las fechas-hora son siempre hora local de Madrid: 'yyyy-MM-dd HH:mm'.

export type RecordType = 'sleep' | 'feed' | 'diaper' | 'bath'

export type SleepKind = 'siesta' | 'nocturno'
export type BathKind = 'completo' | 'aseo'
export type BreastSide = 'izquierdo' | 'derecho' | 'ambos'
export type Consistency = 'liquida' | 'pastosa' | 'solida'

/** Lo que comparten todos los registros. */
interface RecordBase {
  id: string
  /** Instante principal: inicio del intervalo o momento del registro puntual. */
  start: string
  notes: string
  createdBy: string // email
  createdAt: string
  updatedBy: string | null
  updatedAt: string | null
}

/** Registros que duran un rato: el fin puede faltar y la duración se deriva. */
interface IntervalBase extends RecordBase {
  end: string | null
  durationMin: number | null
}

export interface SleepRecord extends IntervalBase {
  type: 'sleep'
  kind: SleepKind
}

/**
 * Una toma puede combinar pecho directo (minutos), leche materna extraída (ml)
 * y fórmula (ml). Son magnitudes distintas y nunca se convierten entre sí: del
 * pecho directo no sabemos cuántos mililitros ha tomado el bebé.
 */
export interface FeedRecord extends IntervalBase {
  type: 'feed'
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
}

export interface DiaperRecord extends RecordBase {
  type: 'diaper'
  pee: boolean
  poop: boolean
  consistency: Consistency | null
}

export interface BathRecord extends RecordBase {
  type: 'bath'
  kind: BathKind
  durationMin: number
}

export type BabyRecord = SleepRecord | FeedRecord | DiaperRecord | BathRecord

/** Registros con intervalo, para el código que trata inicio y fin. */
export type IntervalRecord = SleepRecord | FeedRecord

export function hasInterval(r: BabyRecord): r is IntervalRecord {
  return r.type === 'sleep' || r.type === 'feed'
}

/** Fin del registro, o null si es puntual o sigue abierto. */
export function endOf(r: BabyRecord): string | null {
  return hasInterval(r) ? r.end : null
}

/** Duración en minutos, o null si no aplica. */
export function durationOf(r: BabyRecord): number | null {
  if (hasInterval(r)) return r.durationMin
  return r.type === 'bath' && r.durationMin > 0 ? r.durationMin : null
}

// --- Datos que viajan al crear o editar --------------------------------------

type Audit = 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'

/**
 * El identificador lo genera el cliente antes de enviar: reintentar una
 * petición nunca crea duplicados.
 */
export type RecordInput =
  | Omit<SleepRecord, Audit>
  | Omit<FeedRecord, Audit>
  | Omit<DiaperRecord, Audit>
  | Omit<BathRecord, Audit>

// --- Usuarios y ajustes -------------------------------------------------------

export interface User {
  email: string
  name: string
}

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

// --- Día de vida --------------------------------------------------------------

export interface LifeDayTotals {
  pees: number
  poops: number
  diapers: number
  feeds: number
  breastMin: number
  expressedMl: number
  formulaMl: number
  /** Fórmula + extraída. El pecho directo no es cuantificable en ml. */
  milkMl: number
}

/** Periodo de 24 h contado desde la hora exacta de nacimiento. */
export interface LifeDay {
  number: number
  start: string
  end: string // exclusivo
  totals: LifeDayTotals
}

// --- Respuesta de la API para un día -----------------------------------------

export interface DayData {
  date: string // 'yyyy-MM-dd'
  /** Registros de todas las pestañas cuyo intervalo toca el día, por hora. */
  records: BabyRecord[]
  /**
   * Sueño sin cerrar, sea del día que sea. No implica que el bebé siga
   * dormido: puede ser un cronómetro que se olvidó de detener.
   */
  openSleep: SleepRecord | null
  /** Últimos registros globales, independientes del día consultado. */
  last: {
    feed: FeedRecord | null
    diaper: DiaperRecord | null
    sleepEnd: SleepRecord | null // último sueño finalizado
  }
  users: Record<string, string> // email -> nombre visible
  serverNow: string
  settings: Settings
  lifeDay: LifeDay | null // null mientras no haya fecha de nacimiento
}
