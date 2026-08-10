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

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

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
