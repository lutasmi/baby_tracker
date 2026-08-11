// Modelo de datos de la aplicación.
//
// Cada tipo de registro tiene su propia forma y su propia pestaña en la hoja
// de cálculo. En TypeScript eso se traduce en una unión discriminada por
// `type`: un pañal no tiene duración y una toma no tiene consistencia, y el
// compilador lo sabe.
//
// Las fechas-hora son siempre hora local de Madrid: 'yyyy-MM-dd HH:mm'.

export type RecordType = 'sleep' | 'feed' | 'diaper' | 'bath' | 'weight'

export type SleepKind = 'siesta' | 'nocturno'
export type BathKind = 'completo' | 'aseo'
/** "desconocido" es una respuesta válida: de madrugada vale más no saberlo. */
export type BreastSide = 'izquierdo' | 'derecho' | 'ambos' | 'desconocido'
export type Consistency = 'pedete' | 'liquida' | 'pastosa' | 'solida'
export type PeeAmount = 'poco' | 'medio' | 'mucho'

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

/** Lo que puede haber dentro de una toma. */
export type FeedItemKind = 'pecho' | 'extraida' | 'formula'

/**
 * Un elemento de la toma: una tetada o un biberón, con su propia hora. Cada uno
 * es una fila en la hoja de cálculo, de modo que nada se pierde por el camino.
 */
export interface FeedItem {
  id: string
  kind: FeedItemKind
  start: string
  /** Fin de la tetada. En un biberón es opcional. */
  end: string | null
  /** Pecho de la tetada; null en los biberones. */
  side: BreastSide | null
  /** Mililitros del biberón; 0 en las tetadas. */
  ml: number
}

/**
 * Una toma es el conjunto de sus elementos: puede llevar varias tetadas y
 * varios biberones. Los totales (`breastMin`, `expressedMl`, `formulaMl`) y el
 * intervalo se derivan de ellos, nunca se guardan aparte, así que no pueden
 * contradecirlos.
 *
 * Son magnitudes distintas y nunca se convierten entre sí: del pecho directo no
 * sabemos cuántos mililitros ha tomado el bebé.
 */
export interface FeedRecord extends IntervalBase {
  type: 'feed'
  items: FeedItem[]
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
}

export interface DiaperRecord extends RecordBase {
  type: 'diaper'
  pee: boolean
  /** Cuánto pis; solo tiene sentido si `pee`. */
  peeAmount: PeeAmount | null
  poop: boolean
  /** Consistencia de la caca; solo tiene sentido si `poop`. */
  consistency: Consistency | null
}

export interface BathRecord extends RecordBase {
  type: 'bath'
  kind: BathKind
  durationMin: number
}

/** Una pesada. Se guarda en gramos: es la unidad en la que se lee la báscula. */
export interface WeightRecord extends RecordBase {
  type: 'weight'
  grams: number
}

export type BabyRecord = SleepRecord | FeedRecord | DiaperRecord | BathRecord | WeightRecord

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
/**
 * De una toma solo viajan sus elementos. El intervalo y los totales los deriva
 * el servidor a partir de ellos, así que no pueden contradecirlos.
 */
export type FeedInput = Pick<FeedRecord, 'id' | 'type' | 'items' | 'notes'>

export type RecordInput =
  | Omit<SleepRecord, Audit>
  | FeedInput
  | Omit<DiaperRecord, Audit>
  | Omit<BathRecord, Audit>
  | Omit<WeightRecord, Audit>

// --- Usuarios y ajustes -------------------------------------------------------

export interface User {
  email: string
  name: string
}

export interface Settings {
  birth: string | null // 'yyyy-MM-dd HH:mm'
  /** Peso al nacer en gramos; 0 si no se ha indicado. */
  birthWeightG: number
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
  /** Los registros que empiezan dentro del periodo, en orden. */
  records: BabyRecord[]
}

/** Un día de vida dentro del histórico: totales sí, registros no. */
export interface HistoryDay extends Omit<LifeDay, 'records'> {
  /** Última pesada del periodo, si la hubo. */
  weightG: number | null
}

export interface History {
  birth: string | null
  /** Del día de vida más reciente al más antiguo. */
  days: HistoryDay[]
  /** Todas las pesadas, de la más antigua a la más reciente. */
  weights: WeightRecord[]
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
    /**
     * Últimos pañales con pis y con caca, por separado: un pañal de solo pis
     * no dice nada de la caca, y es lo que se vigila las primeras semanas.
     */
    pee: DiaperRecord | null
    poop: DiaperRecord | null
    sleepEnd: SleepRecord | null // último sueño finalizado
    weight: WeightRecord | null
  }
  /**
   * Última toma anterior al día consultado. Da el hueco de la primera toma de
   * la noche, que si no quedaría sin calcular.
   */
  previousFeed: FeedRecord | null
  users: Record<string, string> // email -> nombre visible
  serverNow: string
  settings: Settings
  lifeDay: LifeDay | null // null mientras no haya fecha de nacimiento
}
