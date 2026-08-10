import { nowPct, stripLanes, stripTicks } from '../lib/daystrip'
import type { BabyRecord } from '../types'

/**
 * El periodo entero en horizontal, con un carril por tipo. De un vistazo se ve
 * a qué horas pasa cada cosa y cómo se relacionan entre sí, que es lo que una
 * lista de "lo último" no puede contar.
 */
export function DayStrip({
  start,
  end,
  records,
  now,
  onSelect,
}: {
  start: string
  end: string
  records: BabyRecord[]
  now: string
  onSelect: (id: string) => void
}) {
  const lanes = stripLanes(records, start, end, now)
  const ticks = stripTicks(start, end)
  const nowLeft = nowPct(start, end, now)

  return (
    <div class="strip">
      <div class="strip-axis">
        <span class="strip-lane-icon" />
        <div class="strip-track">
          {ticks.map((t) => (
            <span key={t.label} class="strip-tick-label" style={`left:${t.leftPct}%`}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {lanes.map((lane) => (
        <div class="strip-lane" key={lane.key}>
          <span class="strip-lane-icon" title={lane.name}>
            {lane.icon}
          </span>
          <div class="strip-track">
            {ticks.map((t) => (
              <span key={t.label} class="strip-grid" style={`left:${t.leftPct}%`} />
            ))}
            {nowLeft != null && <span class="strip-now" style={`left:${nowLeft}%`} />}

            {lane.marks.map((mark) =>
              mark.widthPct > 0.4 ? (
                <button
                  key={mark.id}
                  class={`strip-bar strip-${lane.key}`}
                  style={`left:${mark.leftPct}%;width:${mark.widthPct}%`}
                  aria-label={mark.label}
                  onClick={() => onSelect(mark.id)}
                />
              ) : (
                <button
                  key={mark.id}
                  class={`strip-dot strip-${lane.key}`}
                  style={`left:${mark.leftPct}%`}
                  aria-label={mark.label}
                  onClick={() => onSelect(mark.id)}
                />
              )
            )}
          </div>
        </div>
      ))}

      {records.length === 0 && <p class="field-hint">Sin registros en este periodo todavía.</p>}
    </div>
  )
}
