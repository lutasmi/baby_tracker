import { describe, expect, it } from 'vitest'
import {
  activeOn,
  emptyMedication,
  formatAmount,
  formatDose,
  isActiveOn,
  medicationProblem,
  treatmentLabel,
} from './medications'
import { aMedication } from '../test-fixtures'

describe('qué tratamientos están en curso', () => {
  it('sin fechas, siempre', () => {
    expect(isActiveOn(aMedication(), '2026-08-07')).toBe(true)
  })

  it('sin fecha de fin, no se retira solo', () => {
    const m = aMedication({ from: '2026-08-01' })
    expect(isActiveOn(m, '2026-07-31')).toBe(false)
    expect(isActiveOn(m, '2026-08-01')).toBe(true)
    expect(isActiveOn(m, '2027-01-01')).toBe(true)
  })

  it('el último día del tratamiento cuenta entero', () => {
    const m = aMedication({ from: '2026-08-01', to: '2026-08-03' })
    expect(isActiveOn(m, '2026-08-03')).toBe(true)
    expect(isActiveOn(m, '2026-08-04')).toBe(false)
  })

  it('el selector se queda con los de hoy', () => {
    const vitd = aMedication({ id: 'a', name: 'Vitamina D' })
    const apiretal = aMedication({ id: 'b', name: 'Apiretal', to: '2026-08-05' })
    expect(activeOn([vitd, apiretal], '2026-08-07').map((m) => m.id)).toEqual(['a'])
  })
})

describe('cómo se lee una dosis', () => {
  it('los decimales se escriben con coma', () => {
    expect(formatAmount(0.6)).toBe('0,6')
    expect(formatAmount(2)).toBe('2')
    expect(formatDose(2.4, 'ml')).toBe('2,4 ml')
  })

  it('sin cantidad no hay nada que enseñar', () => {
    expect(formatDose(0, 'ml')).toBe('')
  })

  it('una cantidad sin unidad se enseña igual', () => {
    expect(formatDose(1, '')).toBe('1')
  })
})

describe('el tratamiento en una línea', () => {
  it('lo dice según las fechas que tenga', () => {
    expect(treatmentLabel(aMedication({ from: '2026-08-01', to: '2026-08-12' }))).toBe(
      'del 1 de agosto al 12 de agosto'
    )
    expect(treatmentLabel(aMedication({ from: '2026-08-01' }))).toBe('desde el 1 de agosto')
    expect(treatmentLabel(aMedication({ to: '2026-12-24' }))).toBe('hasta el 24 de diciembre')
    expect(treatmentLabel(aMedication())).toBe('')
  })
})

describe('lo que impide guardar una ficha', () => {
  it('el nombre es lo único obligatorio', () => {
    expect(medicationProblem(aMedication())).toBeNull()
    expect(medicationProblem(emptyMedication('m-1'))).toMatch(/nombre/)
    expect(medicationProblem(aMedication({ name: '   ' }))).toMatch(/nombre/)
  })

  it('un tratamiento no puede acabar antes de empezar', () => {
    expect(
      medicationProblem(aMedication({ from: '2026-08-10', to: '2026-08-01' }))
    ).toMatch(/antes de empezar/)
  })

  it('la ficha en blanco no trae dosis ni fechas', () => {
    expect(emptyMedication('m-1')).toEqual({
      id: 'm-1',
      name: '',
      dose: 0,
      unit: '',
      frequency: '',
      from: null,
      to: null,
    })
  })
})
