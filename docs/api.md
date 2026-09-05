# API

Una sola URL (`/exec` de la aplicación web de Apps Script) que recibe **POST con
JSON** y responde JSON. La acción va en el cuerpo, no en la ruta.

```
POST https://script.google.com/macros/s/…/exec
Content-Type: text/plain;charset=utf-8
```

> El `Content-Type` es `text/plain` a propósito: mantiene la petición "simple" y
> evita el preflight CORS, que Apps Script no responde. El cuerpo es JSON igual.

## Forma de las peticiones y las respuestas

```jsonc
// Petición
{ "action": "getDay", "token": "…", "date": "2026-08-11" }

// Respuesta correcta
{ "ok": true, "data": { … } }

// Respuesta con error
{ "ok": false, "error": { "code": "VALIDATION", "message": "Falta Gramos." } }
```

Todas las acciones salvo `login` llevan `token`. Un `GET` a la misma URL
devuelve `{ ok: true, data: { service: "baby-tracker", time } }`, útil para
comprobar que la implementación responde.

### Códigos de error

| Código | Qué significa | Qué hace la aplicación |
|---|---|---|
| `AUTH` | Sesión ausente, caducada o token de Google no válido | Cierra sesión y vuelve al login |
| `FORBIDDEN` | El correo no está autorizado en `Usuarios` | Cierra sesión y lo explica |
| `VALIDATION` | El registro no cumple las reglas | Muestra el mensaje y no guarda |
| `ACTIVE_SLEEP` | Ya hay un sueño abierto | Muestra el mensaje |
| `NOT_FOUND` | El registro que se edita ya no existe | Muestra el mensaje |
| `CONFIG` | Falta `GOOGLE_CLIENT_ID` o `SPREADSHEET_ID` | Muestra el mensaje |
| `INTERNAL` | Cualquier otro fallo | Muestra el mensaje |

El cliente añade dos códigos propios que el backend nunca emite: `NETWORK` (no
hubo respuesta; hay 30 s de tiempo máximo) y `CONFIG` cuando falta
`VITE_API_URL`.

## Acciones

### `login`

```jsonc
{ "action": "login", "idToken": "<ID token de Google Identity Services>" }
→ { "token": "…", "user": { "email": "ana@example.com", "name": "Ana" } }
```

Verifica el token contra Google, comprueba que el correo está en `Usuarios` con
`Activo = TRUE` y emite una sesión de 180 días.

### `logout`

Invalida la sesión. Devuelve `{ "done": true }`.

### `getDay`

```jsonc
{ "action": "getDay", "date": "2026-08-11" }
```

Todo lo que necesita la pantalla principal en una sola llamada:

| Campo | Contenido |
|---|---|
| `records` | Los registros cuyo intervalo toca esa fecha, por hora |
| `openSleep` | Sueño sin cerrar, sea del día que sea, o `null` |
| `last` | Últimos registros **globales**: `feed`, `diaper`, `pee`, `poop`, `sleepEnd`, `weight` |
| `previousFeed` | Última toma anterior a esa fecha, para el hueco de la primera |
| `lifeDay` | Día de vida **en curso** (según la hora del servidor) con sus totales y sus registros; `null` sin fecha de nacimiento |
| `settings` | Nacimiento y peso al nacer |
| `medications` | El catálogo de medicación, ordenado por nombre |
| `users` | Correo → nombre visible, para mostrar quién anotó cada cosa |
| `serverNow` | Hora del servidor, en hora de Madrid |

`last.feed` y `last.poop` excluyen hidrataciones y pedetes; `last.diaper` no
excluye nada. Ver
[Qué cuenta como toma y qué como caca](funcionamiento.md#qué-cuenta-como-toma-y-qué-como-caca).

El catálogo viaja aquí, y no en una acción aparte, para que el formulario de
una dosis abra con la lista puesta: registrar tiene que costar lo mismo que
antes de que existiera la medicación. Si la pestaña `Medicamentos` todavía no
existe —código actualizado sin ejecutar `setup()`— llega vacío en lugar de
tumbar la petición.

### `getHistory`

```jsonc
{ "action": "getHistory", "days": 14 }
→ { "birth": "…", "days": [ { "number": 7, "start": …, "end": …, "totals": {…}, "weightG": 3300 } ], "weights": [ … ] }
```

Del día de vida más reciente al más antiguo, con un máximo de 60. `weights` son
todas las pesadas con su hora, para la gráfica de eje temporal.

### `getNotes`

```jsonc
{ "action": "getNotes", "limit": 60 }
→ { "notes": [ … ], "more": false, "birth": "…", "users": { … } }
```

Las notas del diario, **de la más reciente a la más antigua**, con un máximo de
365 y 60 por defecto. `more` dice si hay más antiguas de las que se han traído,
para que la pantalla ofrezca cargarlas sin adivinarlo.

Es la única lectura que no va por día: un diario se relee saltando los días en
los que no se escribió nada, así que pedirlo día a día serían decenas de
peticiones para encontrar cuatro notas. A cambio lee una sola pestaña, frente a
las nueve de `getDay`. El nacimiento y los usuarios van dentro porque la
pantalla numera los días de vida y firma cada nota.

### `createRecord` / `updateRecord`

```jsonc
{ "action": "createRecord", "record": { "id": "uuid", "type": "diaper", … } }
→ el registro guardado, ya con auditoría y campos derivados
```

El `id` lo genera el cliente antes de enviar: **crear dos veces el mismo id no
duplica**, devuelve lo que ya había. Editar exige que exista, o devuelve
`NOT_FOUND`.

La forma de `record` es la del tipo, y **solo viajan los campos editables**: el
backend deriva la duración, los totales de la toma y la auditoría. En una toma
solo viajan sus `items`. Los tipos están en
[`web/src/types.ts`](../web/src/types.ts) y el esquema que los valida, en
`RECORD_TYPES` de [`Logic.js`](../apps-script/Logic.js).

### `deleteRecord`

```jsonc
{ "action": "deleteRecord", "type": "feed", "id": "uuid" }
→ { "deleted": true }
```

Borrado lógico. Es idempotente: borrar algo que ya no existe también responde
`{ deleted: true }`.

### `updateSettings`

```jsonc
{ "action": "updateSettings", "settings": { "birth": "2026-08-09 22:40", "birthWeightG": 3420 } }
```

Escribe la pestaña `Bebe`, que es común a todos los usuarios.

### `saveMedication`

```jsonc
{
  "action": "saveMedication",
  "medication": {
    "id": "uuid",
    "name": "Vitamina D",
    "dose": 0.6,
    "unit": "ml",
    "frequency": "cada 24 h",
    "from": "2026-08-01",
    "to": null
  }
}
→ el medicamento guardado
```

Alta y corrección en la misma acción: el `id` lo genera el cliente, así que
guardar dos veces corrige la misma ficha en lugar de duplicarla. `name` es lo
único obligatorio. `from` y `to` son fechas (`yyyy-MM-dd`) o `null`; `to` vacío
es un tratamiento sin fin.

La auditoría (`Creado_Por`, `Creado_En`, …) la pone el servidor en la hoja y no
viaja en la respuesta: la ficha es una lista de la compra, no un registro de lo
que le pasó al bebé.

### `deleteMedication`

```jsonc
{ "action": "deleteMedication", "id": "uuid" }
→ { "deleted": true }
```

Lo retira del catálogo con borrado lógico. **Las dosis ya registradas se quedan
como están**, con el nombre que tenían: lo que se le dio al bebé no depende de
que su ficha siga en la lista. Idempotente, como `deleteRecord`.

## Garantías

- **Escrituras bajo bloqueo global** (`LockService`), con hasta 20 s de espera:
  dos móviles guardando a la vez no se pisan.
- **La autorización se comprueba en cada petición**, no solo al entrar.
- **Las horas las pone el servidor**, en hora de Madrid, para que la auditoría no
  dependa del reloj del móvil.
