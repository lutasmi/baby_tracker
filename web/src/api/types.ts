import type {
  BabyRecord,
  DayData,
  Diary,
  History,
  Medication,
  RecordInput,
  RecordType,
  Settings,
  User,
} from '../types'

export type ApiErrorCode =
  | 'NETWORK'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'ACTIVE_SLEEP'
  | 'NOT_FOUND'
  | 'CONFIG'
  | 'INTERNAL'

export class ApiError extends Error {
  code: ApiErrorCode
  /**
   * Si el fallo puede desaparecer al repetir la petición. Lo pasajero se
   * reintenta solo; lo definitivo —validación, sesión, configuración— no
   * mejora por insistir y se le enseña al usuario cuanto antes.
   */
  retryable: boolean

  constructor(code: ApiErrorCode, message: string, retryable = RETRYABLE_BY_DEFAULT.has(code)) {
    super(message)
    this.code = code
    this.retryable = retryable
  }
}

/** Sin más información, estos dos son los que suelen ser pasajeros. */
const RETRYABLE_BY_DEFAULT = new Set<ApiErrorCode>(['NETWORK', 'INTERNAL'])

export interface Api {
  login(idToken: string): Promise<{ token: string; user: User }>
  logout(): Promise<void>
  getDay(date: string): Promise<DayData>
  /** Totales por día de vida, del más reciente al más antiguo. */
  getHistory(days: number): Promise<History>
  /** Las notas del diario, de la más reciente a la más antigua. */
  getNotes(limit: number): Promise<Diary>
  createRecord(input: RecordInput): Promise<BabyRecord>
  updateRecord(input: RecordInput): Promise<BabyRecord>
  /** El tipo indica en qué pestaña está el registro. */
  deleteRecord(type: RecordType, id: string): Promise<void>
  updateSettings(settings: Settings): Promise<Settings>
  /**
   * Alta o corrección de un medicamento del catálogo. El identificador lo pone
   * el cliente, así que reintentar corrige la misma ficha en vez de duplicarla.
   */
  saveMedication(medication: Medication): Promise<Medication>
  /** Lo retira del selector; las dosis ya registradas se quedan como están. */
  deleteMedication(id: string): Promise<void>
}
