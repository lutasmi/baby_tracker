# Modelo de datos

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
| `Tomas` | Tomas, con sus componentes |
| `Panales` | Cambios de pañal |
| `Banos` | Baños y aseos |
| `Peso` | Pesadas |
| `Usuarios` | Quién puede entrar |
| `Bebe` | Nacimiento y peso al nacer (una sola fila) |

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

**`Tomas`** — `Pecho_Min`, `Pecho_Lado` (Izquierdo · Derecho · Ambos),
`Extraida_Ml`, `Formula_Ml`

> Los minutos de pecho y los mililitros son magnitudes distintas y viven en
> columnas distintas. No se convierten entre sí en ningún punto del sistema:
> del pecho directo no sabemos cuántos mililitros ha tomado el bebé, y fingir
> lo contrario falsearía los totales.

**`Panales`** — `Pis` (TRUE/vacío), `Caca` (TRUE/vacío), `Consistencia`
(Líquida · Pastosa · Sólida)

> Pis y caca son dos columnas independientes, no un desplegable con tres
> opciones. "Ambos" existía antes solo porque no había sitio para dos campos.

**`Banos`** — `Tipo` (Baño completo · Aseo rápido), `Duracion_Min`

**`Peso`** — `Gramos`

> En gramos, que es como se lee la báscula, y se muestra en kilos. La variación
> respecto al nacimiento se calcula, no se guarda.

**`Bebe`** — `Fecha_Nacimiento`, `Hora_Nacimiento`, `Peso_Nacimiento_G`

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
    { key: 'poop', column: 'Caca', kind: 'bool' },
    { key: 'consistency', column: 'Consistencia', kind: 'enum',
      values: { liquida: 'Líquida', pastosa: 'Pastosa', solida: 'Sólida' } },
  ],
  requireAny: ['pee', 'poop'],
}
```

Tipos de campo disponibles: `int` (con `max`), `bool` y `enum` (con `values`,
que es a la vez la lista de valores válidos y la etiqueta que se escribe en la
hoja). Cualquier campo puede llevar `required: true`.

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

Cada petición lee las cinco pestañas de registros, más `Usuarios` y `Bebe`.
Con el volumen de un bebé son unas décimas de segundo sobre los 1-3 s que ya
tarda Apps Script.

Si algún día se nota, la solución no obliga a cambiar el modelo: leer todos los
rangos de una vez con el servicio avanzado de Sheets
(`Sheets.Spreadsheets.Values.batchGet`) sustituyendo el cuerpo de
`readAllRecords()` en [`apps-script/Sheets.js`](../apps-script/Sheets.js).
