// Los reintentos del cliente. Lo que se prueba aquí es qué se repite y qué no:
// repetir lo que no toca gasta segundos delante del usuario, y no repetir lo
// que sí convierte un tropiezo pasajero en un error a la cara.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const respuesta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status: status })

/** El cliente se importa de nuevo en cada prueba para leer la URL simulada. */
async function cliente() {
  vi.stubEnv('VITE_API_URL', 'https://script.google.com/macros/s/test/exec')
  vi.resetModules()
  return (await import('./client')).realApi
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** Ejecuta la promesa dejando correr las esperas entre reintentos. */
async function conEsperas<T>(p: Promise<T>): Promise<T> {
  const done = p.catch((e) => ({ __error: e }) as never)
  await vi.runAllTimersAsync()
  const r = (await done) as T & { __error?: unknown }
  if (r && typeof r === 'object' && '__error' in r) throw r.__error
  return r
}

describe('reintentos', () => {
  it('reintenta cuando la red falla y acaba devolviendo el dato', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(respuesta({ ok: true, data: { date: '2026-08-11' } }))
    vi.stubGlobal('fetch', fetchMock)

    const api = await cliente()
    const day = await conEsperas(api.getDay('2026-08-11'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(day).toMatchObject({ date: '2026-08-11' })
  })

  it('no reintenta un error de validación: no mejora por insistir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuesta({ ok: false, error: { code: 'VALIDATION', message: 'Falta Gramos.' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = await cliente()
    await expect(conEsperas(api.getDay('2026-08-11'))).rejects.toThrow('Falta Gramos.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tampoco reintenta una sesión caducada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuesta({ ok: false, error: { code: 'AUTH', message: 'La sesión ha caducado.' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = await cliente()
    await expect(conEsperas(api.getDay('2026-08-11'))).rejects.toThrow('caducado')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reintenta un 500 del servidor, pero no un 404', async () => {
    const server = vi.fn().mockResolvedValue(respuesta({}, 500))
    vi.stubGlobal('fetch', server)
    let api = await cliente()
    await expect(conEsperas(api.getDay('2026-08-11'))).rejects.toThrow('(500)')
    expect(server).toHaveBeenCalledTimes(3) // el intento y dos reintentos

    const noEncontrado = vi.fn().mockResolvedValue(respuesta({}, 404))
    vi.stubGlobal('fetch', noEncontrado)
    api = await cliente()
    await expect(conEsperas(api.getDay('2026-08-11'))).rejects.toThrow('(404)')
    expect(noEncontrado).toHaveBeenCalledTimes(1)
  })

  it('se rinde tras dos reintentos y devuelve el último error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const api = await cliente()
    await expect(conEsperas(api.getDay('2026-08-11'))).rejects.toThrow(/conexión/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('guardar también se reintenta: repetir no duplica porque el id ya existe', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(respuesta({ ok: true, data: { id: 'uuid-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    const api = await cliente()
    const saved = await conEsperas(
      api.createRecord({ id: 'uuid-1', type: 'feed', items: [], notes: '' })
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(saved).toMatchObject({ id: 'uuid-1' })
    // Las dos peticiones llevan el mismo identificador: el backend devuelve lo
    // ya guardado en lugar de crear otro registro.
    const cuerpos = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string))
    expect(cuerpos[0].record.id).toBe('uuid-1')
    expect(cuerpos[1].record.id).toBe('uuid-1')
  })
})
