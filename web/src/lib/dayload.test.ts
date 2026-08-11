import { describe, expect, it, vi } from 'vitest'
import { aDay } from '../test-fixtures'
import { loadDays } from './dayload'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('loadDays', () => {
  it('pide todas las fechas a la vez, no una detrás de otra', async () => {
    let enCurso = 0
    let maximoSimultaneo = 0
    const getDay = async (date: string) => {
      enCurso++
      maximoSimultaneo = Math.max(maximoSimultaneo, enCurso)
      await espera(5)
      enCurso--
      return aDay({ date })
    }

    const load = await loadDays(getDay, ['2026-08-11', '2026-08-10', '2026-08-09'])

    expect(load.days).toHaveLength(3)
    // Lo que hace la diferencia: tres peticiones abiertas a la vez, no una.
    expect(maximoSimultaneo).toBe(3)
  })

  it('avisa de cada día en cuanto llega, sin esperar a los demás', async () => {
    const llegados: string[] = []
    const getDay = async (date: string) => {
      // El primero de la lista es el más lento: aun así el otro se pinta antes.
      await espera(date === '2026-08-11' ? 20 : 1)
      return aDay({ date })
    }

    await loadDays(getDay, ['2026-08-11', '2026-08-10'], (day) => llegados.push(day.date))

    expect(llegados).toEqual(['2026-08-10', '2026-08-11'])
  })

  it('un día que falla no arrastra a los demás, y se dice cuál fue', async () => {
    const getDay = async (date: string) => {
      if (date === '2026-08-10') throw new Error('se cayó la red')
      return aDay({ date })
    }

    const load = await loadDays(getDay, ['2026-08-11', '2026-08-10', '2026-08-09'])

    expect(load.days.map((d) => d.date)).toEqual(['2026-08-11', '2026-08-09'])
    expect(load.failed.map((f) => f.date)).toEqual(['2026-08-10'])
    // El error se conserva: hay que poder distinguir una sesión caducada.
    expect((load.failed[0].error as Error).message).toBe('se cayó la red')
  })

  it('sin fechas no llama a nadie', async () => {
    const getDay = vi.fn()
    const load = await loadDays(getDay, [])
    expect(getDay).not.toHaveBeenCalled()
    expect(load).toEqual({ days: [], failed: [] })
  })
})
