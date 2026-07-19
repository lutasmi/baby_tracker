// Punto de acceso a la API. En arranque se decide si se usa el backend real
// o el mock de desarrollo; el mock solo entra en el bundle si se importa.

import type { Api } from './types'

export const usingMock = import.meta.env.VITE_USE_MOCK === '1'

let api: Api | null = null

export async function initApi(): Promise<Api> {
  api = usingMock ? (await import('./mock')).createMockApi() : (await import('./client')).realApi
  return api
}

export function getApi(): Api {
  if (!api) throw new Error('La API no está inicializada.')
  return api
}
