// Modelo de datos de la aplicación. Toda la app gira alrededor del Evento.
// Las fechas-hora son siempre hora local de Madrid en formato 'yyyy-MM-dd HH:mm'.

export type EventType = 'sleep' | 'feed' | 'diaper' | 'bath'

// Subtipos por tipo:
//   sleep:  'siesta' | 'nocturno'
//   feed:   'biberon' | 'lactancia'
//   diaper: 'pipi' | 'caca' | 'ambos'
//   bath:   'completo' | 'aseo'
// Detalle (detail) por tipo:
//   feed biberon:   'materna' | 'formula' | 'mixta'   (tipo de leche)
//   feed lactancia: 'izquierdo' | 'derecho' | 'ambos' (pecho)
//   diaper:         'liquida' | 'pastosa' | 'solida'  (consistencia, solo con caca)
export interface BabyEvent {
  id: string
  type: EventType
  subtype: string
  start: string // 'yyyy-MM-dd HH:mm'
  end: string | null // sueño y lactancia; null en sueño activo
  durationMin: number | null // calculada si hay fin; manual en baños
  quantityMl: number | null // solo biberón
  detail: string | null
  notes: string
  createdBy: string // email
  createdAt: string
  updatedBy: string | null
  updatedAt: string | null
}

export interface User {
  email: string
  name: string
}

// Respuesta de la API para un día concreto.
export interface DayData {
  date: string // 'yyyy-MM-dd'
  // Eventos cuyo intervalo toca el día (incluye el sueño nocturno que empezó ayer).
  events: BabyEvent[]
  // Sueño sin finalizar, sea del día que sea. Null si el bebé está despierto.
  activeSleep: BabyEvent | null
  // Últimos eventos globales, independientes del día consultado.
  last: {
    feed: BabyEvent | null
    diaper: BabyEvent | null
    sleepEnd: BabyEvent | null // último sueño finalizado
  }
  users: Record<string, string> // email -> nombre visible
  serverNow: string // 'yyyy-MM-dd HH:mm' hora de Madrid del servidor
}

// Datos que viajan al crear o editar un evento. El cliente genera el id
// (UUID) antes de enviar: reintentar una petición nunca crea duplicados.
export interface EventInput {
  id: string
  type: EventType
  subtype: string
  start: string
  end: string | null
  durationMin: number | null
  quantityMl: number | null
  detail: string | null
  notes: string
}
