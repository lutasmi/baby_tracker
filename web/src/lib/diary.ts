// El diario: las notas agrupadas para releerlas.
//
// Se agrupan por **día natural**, no por día de vida, porque un diario se
// relee contra el calendario: "el día que salimos a desayunar" se busca por la
// fecha. El número de día de vida se enseña al lado cuando se sabe, que es el
// dato que contesta a "¿cuántos días tenía?".

import type { NoteRecord } from '../types'
import { dateOf } from './dates'
import { lifeDayNumber } from './lifeday'

export interface DiaryDay {
  /** 'yyyy-MM-dd'. */
  date: string
  /** Día de vida al que corresponde, o null si no hay fecha de nacimiento. */
  lifeDay: number | null
  /** Las del día, de la más reciente a la más antigua. */
  notes: NoteRecord[]
}

/**
 * Las notas por día, de la más reciente a la más antigua en los dos niveles.
 *
 * Los días sin notas no aparecen: en un diario no se escribe todos los días, y
 * dejar huecos vacíos convertiría el repaso en un desierto.
 */
export function diaryDays(notes: NoteRecord[], birth: string | null): DiaryDay[] {
  const byDate = new Map<string, NoteRecord[]>()
  for (const note of notes) {
    const date = dateOf(note.start)
    const list = byDate.get(date)
    if (list) list.push(note)
    else byDate.set(date, [note])
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({
      date,
      lifeDay: lifeDayOf(birth, date),
      notes: [...list].sort((a, b) =>
        a.start === b.start ? (a.id < b.id ? 1 : -1) : a.start < b.start ? 1 : -1
      ),
    }))
}

/**
 * El día de vida de una fecha, o null.
 *
 * Se cuenta desde el mediodía: un día natural cae a caballo de dos días de
 * vida, y el que más solapa es el que responde a "qué día tenía". Antes de
 * nacer no hay número.
 */
function lifeDayOf(birth: string | null, date: string): number | null {
  if (!birth) return null
  const n = lifeDayNumber(birth, `${date} 12:00`)
  return n > 0 ? n : null
}

/** Solo las destacadas, conservando el orden. */
export function onlyStarred(notes: NoteRecord[]): NoteRecord[] {
  return notes.filter((n) => n.starred)
}
