> Dependencia registrada durante la v2, **no implementada**. Requiere cambiar
> la estructura de Google Sheets, cosa que la v2 tenía prohibida.

# Perfil del bebé y seguimiento de peso

## Qué falta y por qué no se hizo

La v2 podía tocar la experiencia y la lógica, pero no la estructura de la hoja
de cálculo. El peso no cabe en el modelo actual sin forzarlo:

- La pestaña `Eventos` describe **acontecimientos con hora**. Un peso encaja
  como evento (fecha, hora, valor), pero el **peso de nacimiento** no: es un
  dato del bebé, no algo que ocurre cada día.
- No existe ningún sitio donde guardar los datos del propio bebé. Ahora mismo
  la aplicación ni siquiera tiene el concepto de "bebé": solo eventos.

Serializar el peso dentro de una columna existente habría sido posible, pero
es exactamente el tipo de apaño que el documento de principios prohíbe: la hoja
dejaría de leerse de un vistazo y el dato quedaría escondido.

## Lo que ya está preparado

- **Fecha y hora de nacimiento** se guardan en las propiedades del script
  (`SETTINGS`), no en la hoja. Ver [ajustes](#dónde-viven-hoy-los-ajustes).
- El día de vida ya se calcula a partir de ese instante, que es la referencia
  temporal que necesita la curva de peso.
- La pantalla de **Ajustes** ya existe, con su ruta (`#/ajustes`) y su acción
  de API (`updateSettings`). Añadir campos ahí no requiere obra nueva.

## Lo que haría falta

### 1. Peso de nacimiento y perfil

Una pestaña nueva `Bebe` (una sola fila) con, al menos:

| Columna | Ejemplo |
|---|---|
| `Nombre` | Martina |
| `Fecha_Nacimiento` | 2026-08-05 |
| `Hora_Nacimiento` | 09:17 |
| `Peso_Nacimiento_Gramos` | 3420 |

Al existir esta pestaña, la fecha y hora de nacimiento deberían migrar de las
propiedades del script a la hoja, que es la fuente de verdad del proyecto. Los
objetivos del día de vida pueden quedarse donde están: son preferencias de uso,
no datos del bebé.

### 2. Histórico de pesos

Un tipo de evento nuevo, `weight`, dentro de la pestaña `Eventos` que ya existe:

- `Tipo_Evento`: `Peso`
- `Hora_Inicio`: momento de la medición
- `Cantidad`: gramos · `Unidad`: `g`

No hacen falta columnas nuevas: el modelo de eventos ya admite un tipo con
cantidad y unidad. Es justo el caso para el que se diseñó.

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

## Orden sugerido

1. Crear la pestaña `Bebe` en `setup()` (sin romper hojas ya existentes).
2. Mover nacimiento a la hoja, dejando lectura compatible con `SETTINGS`.
3. Añadir el tipo de evento `weight` y su formulario.
4. Añadir el bloque de peso a Ajustes o a una pantalla de perfil.

## Dónde viven hoy los ajustes

Propiedad `SETTINGS` del proyecto de Apps Script, con esta forma:

```json
{ "birth": "2026-08-05 09:17", "goals": { "pees": 6, "poops": 3, "milkMl": 400 } }
```

Se edita desde la aplicación (Ajustes) o a mano en *Configuración del proyecto →
Propiedades de la secuencia de comandos*.
