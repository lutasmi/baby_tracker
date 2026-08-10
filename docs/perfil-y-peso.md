> Siguiente fase, **no implementada**. Con el modelo por pestañas ya no hay
> nada que decidir: es añadir una pestaña y unas columnas.

# Perfil del bebé y seguimiento de peso

## Lo que ya está resuelto

Cuando esto se documentó por primera vez, el peso no cabía en el modelo: había
una única pestaña de eventos con columnas genéricas y no existía ningún sitio
donde guardar datos del propio bebé. Con una pestaña por tipo de registro, esa
dificultad ha desaparecido:

- La pestaña **`Bebe`** ya existe, con el nacimiento y los objetivos diarios.
  Añadir `Nombre` y `Peso_Nacimiento_G` es añadir dos columnas.
- La pantalla de **Ajustes** ya existe, con su ruta (`#/ajustes`) y su acción de
  API (`updateSettings`).
- `setup()` añade columnas nuevas a una pestaña existente sin tocar los datos,
  cosa que está probada.

## Lo que falta

### 1. Peso de nacimiento en `Bebe`

Dos columnas más: `Nombre` y `Peso_Nacimiento_G`. En `Logic.js`, dos entradas en
`BABY_COLUMNS` y su traducción en `babyRowToSettings` / `settingsToBabyRow`.

### 2. Histórico de pesos: un tipo de registro nuevo

Una entrada en `RECORD_TYPES`:

```js
weight: {
  sheet: 'Peso',
  label: 'Peso',
  interval: false,
  fields: [{ key: 'grams', column: 'Gramos', kind: 'int', max: 30000, required: true }],
}
```

Con eso, el backend ya sabe crear la pestaña, validar, escribir, leer y
devolver los registros en la cronología. Falta la parte de interfaz: el miembro
`WeightRecord` en la unión de `types.ts`, su formulario y su icono y texto en
`summary.ts`. El proceso completo está en
[modelo-de-datos.md](modelo-de-datos.md#cómo-añadir-un-tipo-de-registro).

### 3. Cálculos y pantalla

Con el peso de nacimiento y el histórico:

```
Peso nacimiento   3,420 kg
Último peso       3,210 kg
Variación         −210 g
Variación nacim.  −6,1 %
```

La variación porcentual respecto al nacimiento es el dato clínicamente
relevante en las primeras semanas. **La aplicación debe mostrarlo sin
interpretarlo**: nada de rangos "normales", alertas ni recomendaciones. Igual
que con los objetivos del día de vida, el juicio es de los padres y del
pediatra.

## Dónde ponerlo

El peso no es una acción que se repita muchas veces al día, así que no merece un
botón en la rejilla principal. Encaja mejor como una tarjeta en Ajustes —o en
una pantalla de perfil— con el último peso, la variación y un botón para añadir
una medición.
