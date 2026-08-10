import { describe, expect, it } from 'vitest'
import { aBath, aDiaper, aFeed, aSleep } from '../test-fixtures'
import { nowPct, stripLanes, stripTicks } from './daystrip'

const START = '2026-08-07 09:17'
const END = '2026-08-08 09:17'
const NOW = '2026-08-07 21:17' // la mitad del periodo

describe('stripLanes', () => {
  it('coloca cada registro en su carril y en su hora', () => {
    const lanes = stripLanes(
      [
        aSleep({ start: '2026-08-07 21:17', end: '2026-08-08 03:17' }),
        aFeed({ start: '2026-08-07 09:17', end: '2026-08-07 09:47' }),
        aDiaper({ start: '2026-08-07 15:17', pee: true, poop: false }),
      ],
      START,
      END,
      NOW
    )
    const by = (k: string) => lanes.find((l) => l.key === k)!

    // La toma empieza justo al principio y dura media hora de 24 h.
    expect(by('feed').marks[0].leftPct).toBe(0)
    expect(by('feed').marks[0].widthPct).toBeCloseTo((30 / 1440) * 100, 5)
    // El sueño arranca a la mitad y ocupa seis horas.
    expect(by('sleep').marks[0].leftPct).toBeCloseTo(50, 5)
    expect(by('sleep').marks[0].widthPct).toBeCloseTo(25, 5)
    // El pis es puntual: no ocupa ancho.
    expect(by('pee').marks[0].widthPct).toBe(0)
    expect(by('poop').marks).toHaveLength(0)
  })

  it('un pañal con las dos cosas aparece en los dos carriles', () => {
    const lanes = stripLanes(
      [aDiaper({ start: '2026-08-07 12:17', pee: true, poop: true })],
      START,
      END,
      NOW
    )
    expect(lanes.find((l) => l.key === 'pee')!.marks).toHaveLength(1)
    expect(lanes.find((l) => l.key === 'poop')!.marks).toHaveLength(1)
  })

  it('baños y pesadas comparten el carril de otros', () => {
    const lanes = stripLanes([aBath({ start: '2026-08-07 19:00' })], START, END, NOW)
    expect(lanes.find((l) => l.key === 'other')!.marks).toHaveLength(1)
  })

  it('un sueño en curso se dibuja hasta ahora', () => {
    const lanes = stripLanes([aSleep({ start: '2026-08-07 15:17', end: null })], START, END, NOW)
    const mark = lanes.find((l) => l.key === 'sleep')!.marks[0]
    expect(mark.widthPct).toBeCloseTo((360 / 1440) * 100, 5) // de 15:17 a 21:17
  })

  it('un cronómetro olvidado no tiñe media franja de sueño', () => {
    // Abierto desde hace más de catorce horas: se pinta como un instante.
    const lanes = stripLanes([aSleep({ start: '2026-08-07 00:00', end: null })], START, END, NOW)
    expect(lanes.find((l) => l.key === 'sleep')!.marks[0].widthPct).toBe(0)
  })

  it('recorta lo que se sale del periodo', () => {
    const lanes = stripLanes(
      [aSleep({ start: '2026-08-08 06:17', end: '2026-08-08 12:00' })],
      START,
      END,
      NOW
    )
    const mark = lanes.find((l) => l.key === 'sleep')!.marks[0]
    expect(mark.leftPct + mark.widthPct).toBeLessThanOrEqual(100)
  })
})

describe('stripTicks', () => {
  it('marca las horas en punto cada seis horas dentro del periodo', () => {
    expect(stripTicks(START, END).map((t) => t.label)).toEqual(['12:00', '18:00', '00:00', '06:00'])
  })

  it('en un día natural marca desde la medianoche', () => {
    const labels = stripTicks('2026-08-07 00:00', '2026-08-08 00:00').map((t) => t.label)
    expect(labels).toEqual(['00:00', '06:00', '12:00', '18:00'])
  })
})

describe('nowPct', () => {
  it('sitúa el momento actual dentro del periodo', () => {
    expect(nowPct(START, END, NOW)).toBeCloseTo(50, 5)
  })

  it('devuelve null si ahora queda fuera', () => {
    expect(nowPct(START, END, '2026-08-06 10:00')).toBeNull()
    expect(nowPct(START, END, '2026-08-09 10:00')).toBeNull()
  })
})
