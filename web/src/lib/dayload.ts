// Cómo se piden los días a la API.
//
// Una petición a Apps Script tarda 1-3 segundos, así que lo que importa no es
// cuánto se pide sino **cuántas esperas se encadenan**: pedir cuatro días de uno
// en uno son doce segundos mirando una pantalla vacía, y pedirlos a la vez son
// tres.
//
// Vive aquí, separado de los hooks, porque es la parte que puede fallar de
// verdad y conviene poder probarla.

import type { DayData } from '../types'

export interface DayLoad {
  /** Los días que sí se han podido cargar. */
  days: DayData[]
  /** Las que no, para poder decirlo en vez de omitirlas. */
  failed: { date: string; error: unknown }[]
}

/**
 * Pide varias fechas **a la vez** y avisa de cada una según llega.
 *
 * Un fallo en una fecha no arrastra a las demás: se devuelven las que sí
 * llegaron y la lista de las que no. Antes, un día que fallaba desaparecía sin
 * dejar rastro y la cronología se leía como si no hubiera pasado nada ese día.
 */
export async function loadDays(
  getDay: (date: string) => Promise<DayData>,
  dates: string[],
  onDay?: (day: DayData) => void
): Promise<DayLoad> {
  const results = await Promise.all(
    dates.map(async (date) => {
      try {
        const day = await getDay(date)
        // Se avisa en cuanto llega, sin esperar a los demás: así la pantalla
        // se va llenando en vez de quedarse vacía hasta el último.
        onDay?.(day)
        return { date: date, day: day, error: null }
      } catch (err) {
        return { date: date, day: null, error: err }
      }
    })
  )

  const load: DayLoad = { days: [], failed: [] }
  for (const r of results) {
    if (r.day) load.days.push(r.day)
    else load.failed.push({ date: r.date, error: r.error })
  }
  return load
}
