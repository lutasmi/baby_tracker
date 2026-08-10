// Preferencias del dispositivo. Son de quien mira, no del bebé: por eso viven
// en el navegador y no en la hoja de cálculo.

/** Los dos calendarios que conviven: 00:00–23:59 o 24 h desde el nacimiento. */
export type DayMode = 'life' | 'natural'

const KEY = 'babytracker.dayMode'

export function loadDayMode(): DayMode {
  try {
    return localStorage.getItem(KEY) === 'natural' ? 'natural' : 'life'
  } catch {
    return 'life'
  }
}

export function saveDayMode(mode: DayMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura lo que la sesión.
  }
}
