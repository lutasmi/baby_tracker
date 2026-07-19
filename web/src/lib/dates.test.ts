import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMinutes,
  diffMinutes,
  formatAgo,
  formatDateHuman,
  formatDuration,
  isValidDate,
  isValidDt,
  minutesInDay,
  toMadrid,
} from './dates'

describe('toMadrid', () => {
  it('convierte un instante UTC a hora de Madrid en invierno (CET, +1)', () => {
    expect(toMadrid(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15 11:00')
  })

  it('convierte un instante UTC a hora de Madrid en verano (CEST, +2)', () => {
    expect(toMadrid(new Date('2026-07-15T10:00:00Z'))).toBe('2026-07-15 12:00')
  })

  it('cruza la medianoche correctamente', () => {
    expect(toMadrid(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16 00:30')
  })
})

describe('diffMinutes', () => {
  it('calcula diferencias dentro del mismo día', () => {
    expect(diffMinutes('2026-07-15 14:00', '2026-07-15 15:30')).toBe(90)
  })

  it('calcula diferencias que cruzan la medianoche', () => {
    expect(diffMinutes('2026-07-14 21:30', '2026-07-15 07:00')).toBe(570)
  })

  it('devuelve valores negativos si el fin es anterior al inicio', () => {
    expect(diffMinutes('2026-07-15 10:00', '2026-07-15 09:00')).toBe(-60)
  })
})

describe('addMinutes / addDays', () => {
  it('suma minutos cruzando el cambio de mes', () => {
    expect(addMinutes('2026-07-31 23:50', 20)).toBe('2026-08-01 00:10')
  })

  it('resta días cruzando el cambio de año', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('suma días en febrero de año bisiesto', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('minutesInDay', () => {
  it('cuenta completo un intervalo dentro del día', () => {
    expect(minutesInDay('2026-07-15 14:00', '2026-07-15 15:30', '2026-07-15')).toBe(90)
  })

  it('recorta un sueño nocturno al día en que empezó', () => {
    expect(minutesInDay('2026-07-14 21:30', '2026-07-15 07:00', '2026-07-14')).toBe(150)
  })

  it('recorta un sueño nocturno al día en que terminó', () => {
    expect(minutesInDay('2026-07-14 21:30', '2026-07-15 07:00', '2026-07-15')).toBe(420)
  })

  it('devuelve 0 si el intervalo no toca el día', () => {
    expect(minutesInDay('2026-07-14 10:00', '2026-07-14 11:00', '2026-07-15')).toBe(0)
  })
})

describe('validación', () => {
  it('acepta fechas-hora bien formadas', () => {
    expect(isValidDt('2026-07-15 09:05')).toBe(true)
  })

  it('rechaza formatos incorrectos y fechas imposibles', () => {
    expect(isValidDt('2026-07-15T09:05')).toBe(false)
    expect(isValidDt('15/07/2026 09:05')).toBe(false)
    expect(isValidDt('2026-02-30 09:05')).toBe(false)
    expect(isValidDt('2026-07-15 25:00')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
  })
})

describe('formato para personas', () => {
  it('formatea duraciones', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(0)).toBe('0 min')
  })

  it('formatea tiempo transcurrido', () => {
    expect(formatAgo(0)).toBe('ahora mismo')
    expect(formatAgo(12)).toBe('hace 12 min')
    expect(formatAgo(130)).toBe('hace 2 h 10 min')
    expect(formatAgo(3 * 1440)).toBe('hace 3 días')
  })

  it('formatea días relativos al de hoy', () => {
    expect(formatDateHuman('2026-07-15', '2026-07-15')).toBe('Hoy')
    expect(formatDateHuman('2026-07-14', '2026-07-15')).toBe('Ayer')
    expect(formatDateHuman('2026-07-13', '2026-07-15')).toBe('lunes 13 jul')
  })
})
