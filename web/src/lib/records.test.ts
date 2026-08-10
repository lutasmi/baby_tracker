import { describe, expect, it } from 'vitest'
import { formatGrams, formatKg, formatPercent, weightChange } from './records'

describe('formato del peso', () => {
  it('muestra los gramos como kilos con tres decimales', () => {
    expect(formatKg(3420)).toBe('3,420 kg')
    expect(formatKg(3210)).toBe('3,210 kg')
    expect(formatKg(800)).toBe('0,800 kg')
  })

  it('escribe la variación con su signo', () => {
    expect(formatGrams(-210)).toBe('−210 g')
    expect(formatGrams(150)).toBe('+150 g')
    expect(formatPercent(-6.14)).toBe('−6,1 %')
    expect(formatPercent(2)).toBe('+2,0 %')
  })
})

describe('weightChange', () => {
  it('calcula la variación respecto al peso al nacer', () => {
    expect(weightChange(3210, 3420)).toEqual({ diffG: -210, percent: (-210 / 3420) * 100 })
  })

  it('sin peso al nacer no inventa una variación', () => {
    expect(weightChange(3210, 0)).toBeNull()
    expect(weightChange(0, 3420)).toBeNull()
  })
})
