# Modelo de datos

Qué se guarda y dónde. Para lo que hace la aplicación con estos datos está
[funcionamiento.md](funcionamiento.md); para la API, [api.md](api.md).

Una **pestaña por tipo de registro**. Cada tipo tiene sus columnas propias, con
su nombre y su significado, y ninguna columna sirve para dos cosas distintas.

La alternativa —una sola pestaña de eventos con columnas genéricas— obligaba a
serializar información dentro de celdas en cuanto un tipo necesitaba un campo
que los demás no tenían. Este modelo evita esa deuda: añadir un campo es añadir
una columna a una pestaña.

## Pestañas

| Pestaña | Qué guarda |
|---|---|
| `Sueno` | Siestas y sueño nocturno |
| `Tomas` | Tomas: **una fila por cada tetada y cada biberón** |
| `Panales` | Cambios de pañal |
| `Banos` | Baños y aseos |
| `Peso` | Pesadas |
| `Medicacion` | Dosis que se le han dado |
| `Notas` | Notas del día: lo que no cabe en ningún otro registro |
| `Usuarios` | Quién puede entrar |
| `Bebe` | Nacimiento y peso al nacer (una sola fila) |
| `Medicamentos` | El catálogo: qué medicamentos hay, con su dosis y su pauta |

### Columnas comunes a los registros

Se llaman igual en todas las pestañas, y por eso el código que las lee es uno
solo:

| Columna | Contenido |
|---|---|
| `ID` | Identificador único, generado en el móvil antes de enviar |
| `Fecha` | Día del registro, para filtrar y hacer tablas dinámicas |
| `Notas` | Texto libre, opcional |
| `Creado_Por` · `Creado_En` | Quién lo registró y cuándo |
| `Modificado_Por` · `Modificado_En` | Quién lo corrigió por última vez |
| `Eliminado` | Borrado lógico: `TRUE` deja la fila fuera de la aplicación |

Los tipos que **duran un rato** añaden `Hora_Inicio`, `Hora_Fin` y
`Duracion_Min`. Los **puntuales** añaden solo `Hora`. Las horas se guardan
completas (`2026-08-07 12:20`) para que un sueño que cruza la medianoche no sea
ambiguo; `Duracion_Min` se recalcula siempre a partir del intervalo, así que si
editas una hora a mano la duración se corrige sola.

### Columnas propias

**`Sueno`** — `Tipo` (Siesta · Nocturno)

**`Tomas`** — `Toma_ID`, `Tipo` (Pecho · Extraída · Fórmula), `Pecho_Lado`
(Izquierdo · Derecho · Ambos · No recuerdo), `Cantidad_Ml`

Es la única pestaña donde **un registro ocupa varias filas**: una por cada cosa
que pasa dentro de la toma. Las filas que comparten `Toma_ID` son la misma toma.
Una toma con dos tetadas y un biberón son tres filas:

| ID | Toma_ID | Hora_Inicio | Hora_Fin | Duracion_Min | Tipo | Pecho_Lado | Cantidad_Ml |
|---|---|---|---|---|---|---|---|
| `i1` | `t-9f2` | 11:42 | 11:53 | 11 | Pecho | Izquierdo | |
| `i2` | `t-9f2` | 12:03 | 12:13 | 10 | Pecho | Derecho | |
| `i3` | `t-9f2` | 12:20 | | 0 | Fórmula | | 60 |

> **Por qué así.** Con los totales en una sola fila (`Pecho_Min: 21`) se perdía
> cuándo pasó cada cosa, y al reabrir la toma para corregirla no había forma de
> reconstruirla: la aplicación tenía que adivinar una tetada de 21 minutos que
> nunca existió tal cual. Guardando cada elemento con su hora, editar una toma
> es editar lo que pasó dentro.

> **Nada se guarda dos veces.** El intervalo de la toma y sus totales —minutos
> de pecho, mililitros, qué pechos se usaron— **se calculan** a partir de las
> filas cada vez que se leen. Al no estar almacenados, no pueden contradecir a
> sus elementos.

> "No recuerdo" es una respuesta válida a propósito: de madrugada vale más no
> saber qué pecho fue que inventárselo. Si una tetada queda sin anotar, la toma
> entera cuenta como "No recuerdo", salvo que las demás ya sumen los dos
> pechos.

> Los minutos de pecho y los mililitros son magnitudes distintas. No se
> convierten entre sí en ningún punto del sistema: del pecho directo no sabemos
> cuántos mililitros ha tomado el bebé, y fingir lo contrario falsearía los
> totales.

> **Las tomas del modelo anterior se siguen leyendo.** Una fila antigua con
> `Pecho_Min`, `Extraida_Ml` y `Formula_Ml` se convierte en elementos al
> leerla, conservando su hora de fin. En cuanto se edita, se reescribe en el
> formato nuevo. Esas tres columnas ya no se crean, pero si están, se leen.

**`Panales`** — `Pis` (TRUE/vacío), `Pis_Cantidad` (Poco · Medio · Mucho),
`Caca` (TRUE/vacío), `Caca_Cantidad` (Poco · Medio · Mucho), `Consistencia`
(Pedete · Líquida · Pastosa · Sólida)

> Pis y caca son dos columnas independientes, no un desplegable con tres
> opciones. "Ambos" existía antes solo porque no había sitio para dos campos.

> Cada uno lleva **su propia cantidad**, y la caca además su consistencia:
> cuánta había y cómo era son dos preguntas distintas. Los detalles solo se
> guardan si hubo aquello a lo que se refieren.

**`Banos`** — `Tipo` (Baño completo · Aseo rápido), `Duracion_Min`

**`Peso`** — `Gramos`

> En gramos, que es como se lee la báscula, y se muestra en kilos. La variación
> respecto al nacimiento se calcula, no se guarda.

**`Medicacion`** — `Medicamento_ID`, `Medicamento`, `Cantidad`, `Unidad`

> Cada dosis apunta al catálogo por su identificador y guarda **además el
> nombre que tenía el medicamento en ese momento**. Es el único dato que se
> escribe dos veces en toda la aplicación, y es a propósito: la pestaña se
> entiende sola al leerla a mano, y renombrar o retirar un medicamento no
> reescribe lo que ya se le dio al bebé.

> `Cantidad` es la que se dio de verdad, no la del catálogo, y **admite
> decimales**: 0,6 ml de vitamina D redondeados a 1 ml serían casi el doble de
> lo recetado. La unidad viaja con ella porque un 2 suelto no dice nada.

**`Notas`** — `Destacada`

> Es el tipo más pequeño que hay, y el único cuyo contenido **no está en una
> columna propia**: el texto vive en `Notas`, la columna que ya comparten todos
> los registros. La diferencia es que aquí no es opcional —una nota vacía no es
> nada— y admite 2.000 caracteres en vez de 500, porque en los demás tipos la
> nota es una coletilla y aquí es el registro entero.

> `Destacada` marca lo que no se quiere perder entre lo demás: una primera vez,
> un día que merece recordarse.

> **Lleva su hora**, como cualquier registro, y por eso cae sola en el tramo que
> le toca en los dos calendarios. Una "nota del día" sin hora habría obligado a
> elegir de qué día hablamos, el natural o el de vida, y son cosas distintas.

**`Bebe`** — `Fecha_Nacimiento`, `Hora_Nacimiento`, `Peso_Nacimiento_G`

**`Medicamentos`** — `Nombre`, `Dosis`, `Unidad`, `Frecuencia`, `Desde`, `Hasta`

> No es un tipo de registro: no pasa a una hora, es una ficha que se mantiene.
> Existe para una sola cosa —elegir en vez de escribir el nombre a las cuatro
> de la mañana—, y por eso la dosis y la unidad son solo el valor que se
> propone al registrar.

> **No hay columna `Activo`.** Que un tratamiento esté en curso sale de `Desde`
> y `Hasta`, con `Hasta` vacío como "sin fin". Una casilla aparte sería un
> segundo sitio donde decir lo mismo, y dos sitios acaban contradiciéndose.

> `Frecuencia` es texto libre ("cada 8 h", "2 veces al día") y es
> **informativa**: se enseña, no se calcula con ella. La aplicación no dice si
> toca una dosis, porque un olvido al anotar convertiría esa deducción en una
> mentira sobre medicación. La unidad también es libre: lo que recete el
> pediatra, no una lista cerrada.

> **Se puede añadir un medicamento a mano en la hoja.** Una fila con solo el
> nombre vale: lo que identifica la ficha es el nombre, y si no hay `ID` se
> deriva de él. Al corregirla desde la aplicación se reescribe esa misma fila,
> sin duplicarla.

## Lo que se calcula y no se guarda

Nada de esto ocupa una columna: se deriva al leer, de modo que no puede
contradecir a los registros.

| Dato | De dónde sale |
|---|---|
| Intervalo y totales de una toma | De sus filas: del primer elemento al último |
| Duración de cualquier intervalo | Del inicio y el fin, aunque la celda diga otra cosa |
| Totales del día de vida | De los registros que empiezan dentro del periodo |
| Tomas frente a hidrataciones, cacas frente a pedetes | De los minutos de pecho y de la consistencia ([reglas](funcionamiento.md#qué-cuenta-como-toma-y-qué-como-caca)) |
| Variación del peso | Del peso al nacer de la pestaña `Bebe` |
| Si un tratamiento está en curso | De `Desde` y `Hasta` del catálogo, comparados con hoy |

## Dónde se declara todo esto


En `RECORD_TYPES`, al principio de [`apps-script/Logic.js`](../apps-script/Logic.js).
El resto del backend es genérico: lee esa declaración para saber qué pestaña
usar, qué columnas crear, cómo validar y cómo traducir entre fila y registro.

```js
diaper: {
  sheet: 'Panales',
  label: 'Pañal',
  interval: false,
  fields: [
    { key: 'pee',  column: 'Pis',  kind: 'bool' },
    { key: 'peeAmount', column: 'Pis_Cantidad', kind: 'enum',
      values: { poco: 'Poco', medio: 'Medio', mucho: 'Mucho' } },
    { key: 'poop', column: 'Caca', kind: 'bool' },
    { key: 'poopAmount', column: 'Caca_Cantidad', kind: 'enum',
      values: { poco: 'Poco', medio: 'Medio', mucho: 'Mucho' } },
    { key: 'consistency', column: 'Consistencia', kind: 'enum',
      values: { pedete: 'Pedete', liquida: 'Líquida', pastosa: 'Pastosa', solida: 'Sólida' } },
  ],
  requireAny: ['pee', 'poop'],
}
```

Tipos de campo disponibles:

| `kind` | Para qué | `max` |
|---|---|---|
| `int` | Números enteros: gramos, mililitros, minutos | Valor máximo |
| `num` | Números con decimales, como la cantidad de una dosis | Valor máximo |
| `bool` | Sí o no: `TRUE` o celda vacía | — |
| `enum` | Lista cerrada; `values` es a la vez los valores válidos y la etiqueta que se escribe en la hoja | — |
| `text` | Texto libre: el nombre de un medicamento, su unidad | Longitud máxima |

Cualquier campo puede llevar `required: true`.

Y el tipo, además de `sheet`, `label` e `interval`, puede declarar
`requireNotes: true` —el texto de la nota es el registro, sin él no hay nada— y
`notesMax`, el tope de ese texto cuando 500 se queda corto.

La toma es la excepción: se declara con `grouped: true` y no tiene `fields`,
porque sus columnas y su conversión no son genéricas. Todo lo suyo está junto
en `Logic.js`, en el bloque "La toma y sus elementos"
(`normalizeFeed`, `feedToRows`, `rowToFeedItems`, `groupFeedRows`), y el resto
del backend solo pregunta si un tipo es `grouped` para llamar a ese camino.

## Cómo añadir un campo a un tipo

1. Añade el descriptor a `fields` en `RECORD_TYPES`.
2. Ejecuta `setup()` desde el editor de Apps Script: **la columna nueva se
   añade al final de la pestaña sin tocar los datos existentes**.
3. Añade el campo al tipo correspondiente en [`web/src/types.ts`](../web/src/types.ts).
4. Píntalo en el formulario y, si procede, en el resumen del registro.

Los pasos 1 y 2 son el modelo de datos completo. Los pasos 3 y 4 son la
interfaz, y no hay forma de ahorrárselos: un campo que no se puede introducir
ni se ve no sirve de nada.

El tipo `weight` es el ejemplo más corto de lo anterior: se añadió después, y
en el backend son estas seis líneas.

```js
weight: {
  sheet: 'Peso',
  label: 'Peso',
  interval: false,
  fields: [{ key: 'grams', column: 'Gramos', kind: 'int', max: 30000, required: true }],
}
```

Y `med`, que se añadió más tarde todavía, no necesitó nada distinto: solo
campos de texto y uno decimal.

```js
med: {
  sheet: 'Medicacion',
  label: 'Medicación',
  interval: false,
  fields: [
    { key: 'medId', column: 'Medicamento_ID', kind: 'text', max: 80 },
    { key: 'medName', column: 'Medicamento', kind: 'text', max: 80, required: true },
    { key: 'amount', column: 'Cantidad', kind: 'num', max: 10000 },
    { key: 'unit', column: 'Unidad', kind: 'text', max: 20 },
  ],
}
```

## Cómo añadir un tipo de registro

1. Una entrada nueva en `RECORD_TYPES` con su pestaña y sus campos.
2. `setup()` crea la pestaña.
3. Un miembro más en la unión `BabyRecord` de `types.ts`.
4. Su formulario en `RecordForm.tsx`, su icono y su texto en `summary.ts`, y su
   botón en la pantalla principal.

El compilador ayuda: al añadir un miembro a la unión, TypeScript señala todos
los sitios donde falta tratarlo.

## Lo que el modelo garantiza

- **Edición manual**: las columnas se localizan por el nombre de su cabecera, así
  que puedes reordenarlas o añadir las tuyas. Las etiquetas se leen sin
  distinguir mayúsculas ni acentos, las fechas admiten `dd/MM/yyyy`, una hora
  suelta se combina con la columna `Fecha` y una casilla marcada con `x` cuenta
  como `TRUE`.
- **Sin duplicados**: el identificador lo genera el cliente; si una petición
  llega dos veces, la segunda devuelve lo ya guardado.
- **Nada se pierde al actualizar**: `setup()` solo añade lo que falta y nunca
  reordena ni borra.
- **Un solo sueño abierto**, garantizado bajo bloqueo global.

## Rendimiento

Cada petición (`getDay` y `getHistory`) lee las siete pestañas de registros, más
`Usuarios`, `Bebe` y `Medicamentos`. `getNotes` es la excepción barata: lee una
sola pestaña, la del diario, más el nacimiento y los usuarios. `getDay` devuelve además los registros del día de vida en
curso, que casi siempre cae a caballo de dos días naturales: así la pantalla
principal pinta su franja sin una segunda petición.
Con el volumen de un bebé son unas décimas de segundo sobre los 1-3 s que ya
tarda Apps Script.

Si algún día se nota, la solución no obliga a cambiar el modelo: leer todos los
rangos de una vez con el servicio avanzado de Sheets
(`Sheets.Spreadsheets.Values.batchGet`) sustituyendo el cuerpo de
`readAllRecords()` en [`apps-script/Sheets.js`](../apps-script/Sheets.js).
