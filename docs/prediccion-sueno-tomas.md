> Propuesta de diseño para una funcionalidad futura ("Ventanas de sueño",
> ya prevista en [especificacion.md](especificacion.md#funcionalidad-futura-registrada)).
> Este documento es solo planificación: nada de esto está implementado todavía.

# Predicción de próxima toma y próxima hora de dormir

## 1. Objetivo

Mostrar en el Dashboard una estimación orientativa de:

- Cuándo tocará la próxima toma.
- Cuándo convendría empezar a dormir al bebé (fin de la ventana de vigilia actual).

No es un asistente de IA ni un sistema de recomendaciones médicas: es un cálculo
estadístico sobre los propios eventos registrados, apoyado en tablas de
referencia por edad como límite de sentido común.

## 2. Fuentes y su fiabilidad

No todas las fuentes tienen el mismo rigor. Las usamos en distinto papel según su solidez:

| Fuente | Qué aporta | Nivel de evidencia |
|---|---|---|
| [AASM — Consensus Statement (2016)](https://www.aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf) | Horas totales de sueño recomendadas por edad (4-12 m: 12-16h/24h, etc.) | Alto — consenso revisado por pares tras analizar 864 estudios |
| [HealthyChildren.org (AAP) — frecuencia de tomas](https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/how-often-and-how-much-should-your-baby-eat.aspx) | Intervalos típicos entre tomas por edad (recién nacido: 2-3h; 1 mes: 3-4h; 6 meses: 4-5 tomas/día) | Alto — guía clínica de la academia de pediatría |
| [Cleveland Clinic — Wake Windows by Age](https://health.clevelandclinic.org/wake-windows-by-age) | Tabla de ventanas de vigilia por edad | Medio — institución médica seria, pero es una guía práctica, no un estudio primario |
| Apps comerciales (Huckleberry, Pampers, Boppy...) | Variantes de la misma tabla de ventanas de vigilia | Bajo — contenido de marketing, sin fuente primaria citada |

Confirmado explícitamente: **no existe ningún estudio que valide "wake windows" como
concepto**, ni una tabla oficial de la AAP al respecto (fuente: [Hey Sleepy Baby — ¿son evidence-based?](https://heysleepybaby.com/hey-sleepy-baby-wake-windows/)).
Son herramientas prácticas derivadas de observación clínica, no de ensayos controlados.

**Consecuencia para el diseño**: usamos la tabla de ventanas de vigilia solo como
límite de plausibilidad (clamp) sobre una predicción basada en los propios datos
del bebé, nunca como la predicción en sí misma. Las horas totales de sueño (AASM)
y la frecuencia de tomas (AAP) sí tienen respaldo suficiente para usarse con más peso.

## 3. Cómo funcionaría (modelo)

Dos señales combinadas, no una sola:

1. **Señal personal** — media/mediana de los últimos intervalos reales de *este*
   bebé (p. ej. los últimos 6-8 intervalos entre tomas, o entre despertar y
   siguiente sueño). Es la señal principal: cada bebé tiene su propio ritmo.
2. **Señal poblacional (tabla por edad)** — usada solo para:
   - Rellenar cuando aún no hay suficiente historial (menos de ~3 eventos).
   - Poner límites razonables (`clamp`) a la señal personal, para que una
     noche larga puntual no dispare una predicción absurda (p. ej. "próxima
     toma en 9 horas").

```
predicción = clamp(
  mediana_intervalos_reales_del_bebé,
  min_esperado_por_edad,
  max_esperado_por_edad
)
hora_estimada = hora_del_último_evento + predicción
```

Se usa **mediana**, no media, porque es más robusta ante un único intervalo
atípico (p. ej. una noche que durmió del tirón), que es exactamente el tipo de
ruido que tiene este dataset.

## 4. Qué falta en el modelo de datos actual

Para aplicar la tabla por edad hace falta saber la edad del bebé, y ahora mismo
**no se guarda la fecha de nacimiento en ningún sitio** (ni en Sheets ni en
Script Properties). Es lo primero que habría que añadir:

- Igual que `GOOGLE_CLIENT_ID` o `SPREADSHEET_ID`, añadir una propiedad de
  script `BABY_BIRTH_DATE` (`yyyy-MM-dd`), configurable una vez a mano.
- Exponerla en la respuesta de `getDay` (o en un `getConfig` nuevo) para que
  el frontend pueda calcular la edad en semanas.

Todo lo demás (eventos de sueño y tomas) ya existe en la hoja `Eventos`.

## 5. Diseño técnico

### 5.1 Backend (Apps Script)

`getDay` hoy devuelve `last.feed` y `last.sleepEnd` (un único evento). Para
calcular una mediana de intervalos hace falta más de un evento anterior. Lo
mínimo necesario: extender la respuesta con una lista corta de eventos
recientes por tipo, reutilizando `readAllEvents()` que ya existe en
[Sheets.js](../apps-script/Sheets.js):

```js
// apps-script/Sheets.js — nueva función, mismo patrón que readAllEvents()
function readRecentEvents(type, limit) {
  return readAllEvents()
    .filter(function (e) { return e.Tipo_Evento === type && !e.Eliminado; })
    .sort(function (a, b) { return b.Hora_Inicio < a.Hora_Inicio ? -1 : 1; })
    .slice(0, limit);
}
```

Y añadirlo a la respuesta de `getDay` en [Main.js](../apps-script/Main.js) junto
al resto de `last`:

```js
recentFeeds: readRecentEvents('feed', 8),
recentSleeps: readRecentEvents('sleep', 8),
babyBirthDate: props.getProperty('BABY_BIRTH_DATE'), // puede ser null
```

Nada de lógica de predicción en el backend: solo sirve datos, igual que hace
ahora con `last`. El cálculo vive en el frontend para poder testearlo con
Vitest, como el resto de `web/src/lib/`.

### 5.2 Frontend — nuevo módulo `web/src/lib/predict.ts`

Sigue exactamente el mismo patrón que [derive.ts](../web/src/lib/derive.ts):
funciones puras, reciben datos y "ahora", no tocan el reloj ni la red.

```ts
// web/src/lib/predict.ts
import type { BabyEvent } from '../types'
import { addMinutes, diffMinutes } from './dates'

export interface AgeRange {
  minMin: number
  maxMin: number
}

// Fuente: Cleveland Clinic — health.clevelandclinic.org/wake-windows-by-age
// No es un estudio validado, solo un límite de plausibilidad (ver docs/prediccion-sueno-tomas.md).
const WAKE_WINDOW_BY_AGE_WEEKS: { maxWeeks: number; range: AgeRange }[] = [
  { maxWeeks: 6, range: { minMin: 45, maxMin: 60 } },
  { maxWeeks: 12, range: { minMin: 60, maxMin: 90 } },
  { maxWeeks: 24, range: { minMin: 105, maxMin: 150 } },
  { maxWeeks: 52, range: { minMin: 150, maxMin: 240 } },
]

// Fuente: HealthyChildren.org (AAP) — frecuencia típica de tomas por edad.
const FEED_INTERVAL_BY_AGE_WEEKS: { maxWeeks: number; range: AgeRange }[] = [
  { maxWeeks: 4, range: { minMin: 120, maxMin: 180 } },
  { maxWeeks: 26, range: { minMin: 180, maxMin: 240 } },
]

function rangeForAge(table: typeof WAKE_WINDOW_BY_AGE_WEEKS, ageWeeks: number): AgeRange {
  const row = table.find((r) => ageWeeks <= r.maxWeeks) ?? table[table.length - 1]
  return row.range
}

function clamp(value: number, range: AgeRange): number {
  return Math.min(Math.max(value, range.minMin), range.maxMin)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function intervalsBetweenStarts(events: BabyEvent[]): number[] {
  // events viene ordenado de más reciente a más antiguo (igual que recentFeeds).
  const out: number[] = []
  for (let i = 0; i < events.length - 1; i++) {
    out.push(diffMinutes(events[i + 1].start, events[i].start))
  }
  return out
}

export interface Prediction {
  estimatedAt: string // 'yyyy-MM-dd HH:mm'
  basedOnHistory: boolean // false si se usó solo la tabla por edad (poco historial)
}

export function predictNextFeed(recentFeeds: BabyEvent[], ageWeeks: number): Prediction | null {
  if (recentFeeds.length === 0) return null
  const range = rangeForAge(FEED_INTERVAL_BY_AGE_WEEKS, ageWeeks)
  const m = median(intervalsBetweenStarts(recentFeeds))
  const minutes = m == null ? (range.minMin + range.maxMin) / 2 : clamp(m, range)
  return {
    estimatedAt: addMinutes(recentFeeds[0].start, minutes),
    basedOnHistory: recentFeeds.length >= 3,
  }
}

export function predictNextSleep(
  awakeSince: string | null,
  recentSleeps: BabyEvent[],
  ageWeeks: number
): Prediction | null {
  if (!awakeSince) return null // ya está dormido o se desconoce el estado
  const range = rangeForAge(WAKE_WINDOW_BY_AGE_WEEKS, ageWeeks)
  // Ventanas de vigilia reales: intervalo entre el fin de un sueño y el inicio del siguiente.
  const wakePeriods: number[] = []
  for (let i = 0; i < recentSleeps.length - 1; i++) {
    const end = recentSleeps[i + 1].end
    if (end) wakePeriods.push(diffMinutes(end, recentSleeps[i].start))
  }
  const m = median(wakePeriods)
  const minutes = m == null ? (range.minMin + range.maxMin) / 2 : clamp(m, range)
  return {
    estimatedAt: addMinutes(awakeSince, minutes),
    basedOnHistory: wakePeriods.length >= 3,
  }
}
```

Con sus tests correspondientes en `predict.test.ts`, igual que
[derive.test.ts](../web/src/lib/derive.test.ts):

```ts
// web/src/lib/predict.test.ts
import { describe, expect, it } from 'vitest'
import { predictNextFeed } from './predict'
import type { BabyEvent } from '../types'

const feed = (start: string): BabyEvent => ({
  id: start, type: 'feed', subtype: 'biberon', start, end: null,
  durationMin: null, quantityMl: 120, detail: 'formula', notes: '',
  createdBy: 'a@a.com', createdAt: start, updatedBy: null, updatedAt: null,
})

describe('predictNextFeed', () => {
  it('usa la mediana de los últimos intervalos reales', () => {
    const feeds = [feed('2026-07-23 14:00'), feed('2026-07-23 10:30'), feed('2026-07-23 07:00')]
    const result = predictNextFeed(feeds, 10)
    expect(result?.estimatedAt).toBe('2026-07-23 17:30') // +3h30, mediana de 3h30 y 3h30
    expect(result?.basedOnHistory).toBe(true)
  })

  it('sin historial suficiente, cae en el punto medio de la tabla por edad', () => {
    const result = predictNextFeed([feed('2026-07-23 14:00')], 2)
    expect(result?.basedOnHistory).toBe(false)
  })
})
```

### 5.3 UI — Dashboard

En [Dashboard.tsx](../web/src/views/Dashboard.tsx), junto a las tarjetas ya
existentes de "Última toma" / estado de sueño:

```tsx
{nextFeed && (
  <div class="card card-soft">
    <span>🍼 Próxima toma estimada: {timeOf(nextFeed.estimatedAt)}</span>
    {!nextFeed.basedOnHistory && <small>(estimación con poco historial)</small>}
  </div>
)}
```

Siempre como texto informativo secundario, nunca como notificación push ni
alarma — coherente con lo hablado antes sobre no automatizar decisiones de
cuidado a partir de una estimación estadística.

## 6. Ejemplo numérico

Bebé de 10 semanas. Últimas 3 tomas: 07:00, 10:30, 14:00 (intervalos: 210 y
210 min → mediana 210 min). Tabla AAP para esa edad: 180-240 min → 210 ya
está dentro de rango, no hace falta recortar.

**Próxima toma estimada: 14:00 + 210 min = 17:30.**

Si en vez de eso el bebé hubiera dormido una siesta larga y el último
intervalo real fuese de 320 min, se recortaría a 240 min (el máximo de la
tabla) antes de proyectar la hora, evitando una estimación disparatada.

## 7. Límites y advertencias (ya acordados)

- Es una estimación, no una instrucción — se muestra, nunca se impone.
- No sustituye la pauta del pediatra, sobre todo en recién nacidos donde a
  veces hay que despertar al bebé por motivos médicos que el algoritmo no conoce.
- Sin automatizaciones (alarmas obligatorias, notificaciones insistentes) a
  partir de la predicción.

## 8. Alcance sugerido

**V1 de esta fase:**
- Propiedad `BABY_BIRTH_DATE` + `recentFeeds`/`recentSleeps` en `getDay`.
- `predict.ts` con `predictNextFeed` y `predictNextSleep`.
- Dos líneas informativas nuevas en el Dashboard.

**Fuera de alcance por ahora** (ya recogido como funcionalidad futura en
[especificacion.md](especificacion.md#funcionalidad-futura-registrada)):
- Predecir la hora de despertar de una siesta en curso (la evidencia para esto
  es aún más débil que para las ventanas de vigilia).
- Cualquier variante con IA/LLM — descartada en la conversación previa: para
  una predicción numérica sobre datos estructurados no aporta precisión extra
  sobre la mediana calculada aquí, y sí añade coste, latencia y menos control.
