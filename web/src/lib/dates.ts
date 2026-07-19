// Utilidades de fecha y hora. Toda la aplicación trabaja con hora local de
// Madrid representada como texto: 'yyyy-MM-dd HH:mm' (fecha-hora) y
// 'yyyy-MM-dd' (día). La aritmética se hace sobre el reloj de pared usando
// Date.UTC, de modo que el resultado no depende de la zona horaria del
// dispositivo que ejecuta el código.

export const TZ = 'Europe/Madrid'

const fmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Instante actual como hora de pared de Madrid: 'yyyy-MM-dd HH:mm'. */
export function nowMadrid(): string {
  return toMadrid(new Date())
}

/** Convierte un instante real a hora de pared de Madrid. */
export function toMadrid(d: Date): string {
  // 'sv-SE' produce 'yyyy-MM-dd HH:mm'. Algunos motores devuelven la
  // medianoche como '24:00'; se normaliza al día siguiente '00:00'.
  const s = fmt.format(d)
  if (s.includes(' 24:')) {
    return addMinutes(s.replace(' 24:', ' 00:'), 24 * 60)
  }
  return s
}

export function isValidDt(dt: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dt)) return false
  return isValidDate(dt.slice(0, 10)) && dt.slice(11) < '24:00'
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [y, m, d] = date.split('-').map(Number)
  const dd = new Date(Date.UTC(y, m - 1, d))
  return dd.getUTCFullYear() === y && dd.getUTCMonth() === m - 1 && dd.getUTCDate() === d
}

/** 'yyyy-MM-dd HH:mm' -> 'yyyy-MM-dd' */
export function dateOf(dt: string): string {
  return dt.slice(0, 10)
}

/** 'yyyy-MM-dd HH:mm' -> 'HH:mm' */
export function timeOf(dt: string): string {
  return dt.slice(11, 16)
}

export function combine(date: string, time: string): string {
  return `${date} ${time}`
}

// --- Aritmética de reloj de pared -----------------------------------------

function toUtcMs(dt: string): number {
  const y = Number(dt.slice(0, 4))
  const mo = Number(dt.slice(5, 7))
  const d = Number(dt.slice(8, 10))
  const h = Number(dt.slice(11, 13) || '0')
  const mi = Number(dt.slice(14, 16) || '0')
  return Date.UTC(y, mo - 1, d, h, mi)
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Minutos de b - a según el reloj de pared. */
export function diffMinutes(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 60000)
}

export function addMinutes(dt: string, minutes: number): string {
  return fromUtcMs(toUtcMs(dt) + minutes * 60000)
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(`${date} 00:00`) + days * 86400000).slice(0, 10)
}

/**
 * Minutos del intervalo [start, end] que caen dentro del día indicado.
 * Un sueño de 21:30 a 07:00 aporta 150 min al día en que empezó y 420 al
 * siguiente.
 */
export function minutesInDay(start: string, end: string, date: string): number {
  const dayStart = toUtcMs(`${date} 00:00`)
  const dayEnd = dayStart + 86400000
  const s = Math.max(toUtcMs(start), dayStart)
  const e = Math.min(toUtcMs(end), dayEnd)
  return Math.max(0, Math.round((e - s) / 60000))
}

// --- Formato para personas -------------------------------------------------

/** 90 -> '1 h 30 min'; 45 -> '45 min'; 120 -> '2 h'. */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} min`
  if (rest === 0) return `${h} h`
  return `${h} h ${rest} min`
}

/** Tiempo transcurrido: 'hace 5 min', 'hace 2 h 10 min', 'hace 3 días'. */
export function formatAgo(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 1) return 'ahora mismo'
  if (m < 60) return `hace ${m} min`
  if (m < 48 * 60) return `hace ${formatDuration(m)}`
  return `hace ${Math.floor(m / 1440)} días`
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'Hoy', 'Ayer' o 'martes 15 jul'. */
export function formatDateHuman(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, -1)) return 'Ayer'
  const d = new Date(toUtcMs(`${date} 00:00`))
  const label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return date < addDays(today, -300) ? `${label} ${d.getUTCFullYear()}` : label
}
