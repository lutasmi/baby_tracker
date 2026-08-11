import { beforeEach, describe, expect, it } from 'vitest'
import { aDay } from './test-fixtures'
import { clearDayCache, fetchDay, getCachedDay } from './store'

beforeEach(() => clearDayCache())

describe('fetchDay', () => {
  it('no repite una petición que ya está en curso', async () => {
    let llamadas = 0
    const getDay = async (date: string) => {
      llamadas++
      await new Promise((r) => setTimeout(r, 5))
      return aDay({ date })
    }

    // La pantalla principal y la cronología piden el mismo día a la vez.
    const [a, b] = await Promise.all([
      fetchDay('2026-08-11', getDay),
      fetchDay('2026-08-11', getDay),
    ])

    expect(llamadas).toBe(1)
    expect(a).toBe(b)
  })

  it('guarda en la caché lo que trae', async () => {
    await fetchDay('2026-08-11', async (date) => aDay({ date }))
    expect(getCachedDay('2026-08-11')?.date).toBe('2026-08-11')
  })

  it('una vez terminada, la siguiente petición vuelve a preguntar', async () => {
    let llamadas = 0
    const getDay = async (date: string) => {
      llamadas++
      return aDay({ date })
    }

    await fetchDay('2026-08-11', getDay)
    await fetchDay('2026-08-11', getDay)

    // Refrescar tiene que seguir siendo posible: la caché la usa quien pinta,
    // no quien pide.
    expect(llamadas).toBe(2)
  })

  it('un fallo no deja la fecha bloqueada para siempre', async () => {
    const falla = async () => {
      throw new Error('sin red')
    }
    await expect(fetchDay('2026-08-11', falla)).rejects.toThrow('sin red')

    // Si la petición fallida se quedara en curso, reintentar no haría nada.
    const day = await fetchDay('2026-08-11', async (date) => aDay({ date }))
    expect(day.date).toBe('2026-08-11')
  })
})
