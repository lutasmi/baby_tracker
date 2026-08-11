import type {
  BabyRecord,
  DayData,
  History,
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
  createRecord(input: RecordInput): Promise<BabyRecord>
  updateRecord(input: RecordInput): Promise<BabyRecord>
  /** El tipo indica en qué pestaña está el registro. */
  deleteRecord(type: RecordType, id: string): Promise<void>
  updateSettings(settings: Settings): Promise<Settings>
}
