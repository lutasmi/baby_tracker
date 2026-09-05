import { describe, expect, it } from 'vitest'
import { aNote } from '../test-fixtures'
import { diaryDays, onlyStarred } from './diary'

const BIRTH = '2026-08-05 00:00'

describe('cómo se agrupa el diario', () => {
  it('por día natural, del más reciente al más antiguo', () => {
    const days = diaryDays(
      [
        aNote({ id: 'a', start: '2026-08-05 10:00' }),
        aNote({ id: 'b', start: '2026-08-07 09:00' }),
        aNote({ id: 'c', start: '2026-08-07 21:40' }),
      ],
      BIRTH
    )
    expect(days.map((d) => d.date)).toEqual(['2026-08-07', '2026-08-05'])
    // Y dentro del día, también lo último arriba.
    expect(days[0].notes.map((n) => n.id)).toEqual(['c', 'b'])
  })

  it('los días sin notas no aparecen', () => {
    // Entre el 5 y el 7 no se escribió nada: el diario no deja el hueco.
    const days = diaryDays(
      [aNote({ start: '2026-08-05 10:00' }), aNote({ start: '2026-08-07 10:00' })],
      BIRTH
    )
    expect(days).toHaveLength(2)
  })

  it('cada día lleva el día de vida que le corresponde', () => {
    const days = diaryDays([aNote({ start: '2026-08-07 21:40' })], BIRTH)
    expect(days[0].lifeDay).toBe(3)
  })

  it('sin fecha de nacimiento no hay número de día', () => {
    expect(diaryDays([aNote()], null)[0].lifeDay).toBeNull()
  })

  it('una nota anterior al nacimiento no inventa un día cero', () => {
    // Se puede escribir antes de que nazca: la aplicación lo admite.
    const days = diaryDays([aNote({ start: '2026-08-01 10:00' })], BIRTH)
    expect(days[0].lifeDay).toBeNull()
  })

  it('sin notas no hay días', () => {
    expect(diaryDays([], BIRTH)).toEqual([])
  })
})

describe('las destacadas', () => {
  it('se pueden mirar aparte, en el mismo orden', () => {
    const notes = [
      aNote({ id: 'a', starred: true }),
      aNote({ id: 'b' }),
      aNote({ id: 'c', starred: true }),
    ]
    expect(onlyStarred(notes).map((n) => n.id)).toEqual(['a', 'c'])
  })
})
