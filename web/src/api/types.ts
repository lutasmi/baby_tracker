import type { BabyEvent, DayData, EventInput, User } from '../types'

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
  createEvent(input: EventInput): Promise<BabyEvent>
  updateEvent(input: EventInput): Promise<BabyEvent>
  deleteEvent(id: string): Promise<void>
}
