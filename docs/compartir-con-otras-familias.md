> **Evolutivo no implementado.** Nada de lo que hay aquí está en la aplicación.
> Es el análisis de cómo pasar de un despliegue para una familia a varios, y
> qué haría falta si algún día tuviera que llegar a gente desconocida.

# Compartir la aplicación con otras familias

## El punto de partida

Hoy un despliegue sirve a **una familia con un bebé**. No por casualidad: hay
cuatro sitios donde eso está asumido.

| Qué | Dónde |
|---|---|
| Una sola hoja, en una propiedad del proyecto de script | `SPREADSHEET_ID`, en `getSpreadsheet()` de [Sheets.js](../apps-script/Sheets.js) |
| `Usuarios` es una lista plana, sin columna de familia | `USER_COLUMNS`, en [Logic.js](../apps-script/Logic.js) |
| `Bebe` es **una fila**, la 2 | `readSettings()`, en [Sheets.js](../apps-script/Sheets.js) |
| La sesión guarda solo el email | `login()`, en [Main.js](../apps-script/Main.js) |

Y en el frontend, `VITE_API_URL` se resuelve en tiempo de compilación
([client.ts](../web/src/api/client.ts)): **un build = un backend = una familia**.

Importa saber que las propiedades del script son del proyecto entero, no de
cada implementación. Un mismo proyecto de Apps Script no puede servir a dos
hojas por mucho que se despliegue dos veces.

## Lo que ya funciona: varios padres, un bebé

Esto no hay que construirlo. Se añade el email en la pestaña `Usuarios` con
`Activo = TRUE` y ya está. Cada registro guarda su autor y su fecha de creación
y modificación, y `requireSession()` vuelve a comprobar el usuario en **cada**
petición, así que poner `Activo = FALSE` corta el acceso en la siguiente aunque
la sesión dure 180 días.

Lo que no existe es **otra familia con otro bebé**.

## Las tres formas de compartir

| | Trabajo | Quién custodia los datos | Techo |
|---|---|---|---|
| **1.** Cada familia se despliega todo | Ninguno | Cada uno los suyos | Solo padres técnicos |
| **2.** Una instancia por familia, un frontend | ~1 día | Quien tenga la hoja | Hasta donde llegues a mano |
| **3.** Multi-tenant de verdad | ~1 semana + RGPD | Tú, de todos | 20-40 familias, y luego Sheets se queda corto |

La **1** es gratis pero son 25 minutos de Google Cloud Console y Apps Script
por familia: sirve para alguien que sepa lo que hace, no para tu hermana.

La **2** es la buena mientras las familias sean conocidas. Es la que se
describe abajo.

La **3** solo compensa si el objetivo es que se dé de alta gente que no te
conoce, y llega con una factura que no es de código.

## La opción 2 en detalle

### Qué es "una instancia"

Por familia:

- **Una hoja de cálculo**, con sus pestañas de registros más `Usuarios` y `Bebe`.
- **Un proyecto de Apps Script** con su implementación, y en sus propiedades
  su `SPREADSHEET_ID` y el `GOOGLE_CLIENT_ID` compartido.

Compartido entre todas:

- **Un solo build del frontend**, publicado una vez.
- **Un solo Client ID de OAuth**, el tuyo.

### El Client ID puede ser el mismo para todas

Un Client ID no es un secreto: viaja en el navegador. El origen autorizado es
tu dominio, y cada backend guarda ese mismo valor en su propiedad
`GOOGLE_CLIENT_ID` para que cuadre la comprobación de `aud` que hace
`verifyGoogleIdToken()`. No hace falta un proyecto de Google Cloud por familia.

Con pocas familias, basta con meter sus emails como usuarios de prueba en la
pantalla de consentimiento: no hay que publicar la aplicación ni pasar
verificación. El flujo de Google Identity Services entrega un ID token y la
aplicación emite su propia sesión, así que la caducidad de 7 días de los
refresh tokens en modo prueba no afecta.

### Nadie necesita acceso a la hoja

Es el punto que más se malinterpreta. El backend está desplegado como
`executeAs: USER_DEPLOYING` y `access: ANYONE_ANONYMOUS`
([appsscript.json](../apps-script/appsscript.json)): **el script abre la hoja
con la cuenta de quien lo desplegó**, no con la de quien usa la aplicación.

Las cuentas de Google de los padres no necesitan ni un permiso de Drive. Entran
con Google solo para **demostrar quién son**: `login()` verifica el token, saca
el email y lo busca en la pestaña `Usuarios` de esa hoja. El permiso vive en una
fila de la hoja, no en Drive.

```
                     ┌──────────────────┐   ejecuta como quien   ┌──────────────┐
   móvil familia A ─►│ Apps Script #1   │──── lo desplegó ──────►│ Hoja A       │
                     └──────────────────┘                        └──────────────┘
                     ┌──────────────────┐                        ┌──────────────┐
   móvil familia B ─►│ Apps Script #2   │───────────────────────►│ Hoja B       │
                     └──────────────────┘                        └──────────────┘
                              ▲
                    su cuenta de Google solo
                    sirve para identificarse
```

Compartir la hoja con ellos es **opcional**, y solo tiene sentido si quieres
que puedan abrirla y editarla a mano — que el proyecto lo soporta a propósito.

### Dónde vive la hoja

Dos variantes, misma cantidad de código (ninguna):

- **En tu Drive.** Lo más simple. Tú puedes leer los datos de todos, así que
  hay que decirlo en voz alta antes de empezar.
- **En el Drive de cada familia, compartida contigo como editor.** `openById()`
  no distingue. Ellos son los dueños de sus datos y pueden borrarlos; tú sigues
  controlando el código. Cambia el propietario del fichero, nada más.

En ambos casos los scripts corren bajo tu cuenta: comparten tu cuota diaria y
dependen de que tu cuenta esté sana.

### El único cambio de código

Sacar `VITE_API_URL` del build y llevarlo a `localStorage`, con una pantalla de
conexión antes del login donde se pega la URL `/exec` de esa familia. Vive junto
a la sesión, en [session.ts](../web/src/session.ts).

Sin eso, N familias son N builds, N URLs y N PWAs instaladas, y cada
actualización se despliega N veces. Con eso, una sola PWA sirve a todas y los
despliegues del frontend vuelven a ser uno.

### Mantener N backends sincronizados

Ya existe [.clasp.json.example](../apps-script/.clasp.json.example). Un bucle
sobre los `scriptId` con `clasp push` y `clasp deploy` convierte "actualizar el
backend" en un comando. Conviene montarlo el primer día, no el tercer mes.

## Lo que la opción 2 no resuelve

Depende de que alguien monte cada instancia a mano. Escala a los amigos de tus
amigos y se acaba ahí. El día que alguien que no te conoce quiera darse de alta
solo, hace falta la opción 3 entera.

Lo que sí deja es el ensayo con números reales: cuántas peticiones hace de
verdad una familia con dos móviles y un recién nacido, y qué cuesta operar
varias instancias. Los dos datos que hacen falta para decidir la opción 3 con
fundamento en lugar de a ojo.

## Si algún día hace falta multi-tenant de verdad

### Qué cambia

- Una hoja maestra `Familias` (id → `spreadsheet_id`) y `getSpreadsheet(familiaId)`.
  `Sheets.js` es el epicentro: la caché `_ss` y `_sheetCache` pasan a ser por
  familia. De ahí sale fontanería mecánica por todo `Main.js`.
- La sesión guarda la familia además del email, y `requireSession()` la
  devuelve.
- El login deja de ser lista blanca. Hoy un email desconocido recibe
  `FORBIDDEN`; tendría que ofrecer "crear familia" o "entrar con código de
  invitación". `setup()` ya sabe crear una hoja desde cero y dar de alta al
  primer usuario (`addOwnerIfEmpty()`): esa es la base del alta automática.

### Hoja por familia, no columna `Familia_ID`

Tentador poner una columna y filtrar, pero es peor en todo:

- Una sola hoja crece sin techo (Sheets corta en 10 millones de celdas).
- `readAllRecords()` la leería entera en cada `getDay` para quedarse con una
  parte.
- Un fallo en el filtro enseña los datos de otra familia. Con hoja por familia
  el aislamiento es por construcción.
- Se pierde el "abro mi hoja y la edito a mano", que es de lo mejor que tiene
  el proyecto.

### El techo real es la cuota

Una cuenta de Google gratuita tiene un límite diario de tiempo total de
ejecución de scripts (90 minutos según la tabla de cuotas de Apps Script;
conviene volver a mirarla, cambia). Cada `getDay` lee todas las pestañas, a 1-3
segundos por petición: son del orden de **3.000-5.000 peticiones al día entre
todas las familias**. Una familia activa con dos móviles hace fácil 100-200.

Eso son 20-40 familias, no 400. Y `withLock()` usa `LockService.getScriptLock()`,
que serializaría las escrituras de todo el mundo.

Pasado ese punto, Sheets deja de ser la respuesta y toca una base de datos de
verdad. Merece la pena tenerlo claro de antemano: es exactamente el momento en
que el proyecto pierde su mejor propiedad.

### Y lo que no es código

Guardar datos de salud de bebés ajenos te convierte en responsable del
tratamiento: base legal, política de privacidad, borrado a petición,
notificación si hay una brecha. Entre amigos se asume de palabra. Publicado, no.

## Lo que hay que tocar en cualquiera de los casos

- **La zona horaria está fija.** `Europe/Madrid` aparece en
  [dates.ts](../web/src/lib/dates.ts), en `TZ` de [Main.js](../apps-script/Main.js)
  y en [appsscript.json](../apps-script/appsscript.json). Irrelevante si todas
  las familias están en España, bloqueante en cuanto una no lo esté.
- **Un bebé por hoja.** `Bebe` es una fila. Unos gemelos rompen el modelo antes
  que una cuarta familia, y es un eje distinto del de compartir.

## Dar de alta una familia, paso a paso

Con la opción 2, y suponiendo el cambio de la URL en `localStorage` ya hecho:

1. Crear el proyecto de Apps Script y subir los cuatro archivos de
   [apps-script/](../apps-script/) — ver [despliegue.md](despliegue.md), fase 1.
2. Ejecutar `setup()`: crea la hoja con todas las pestañas y da de alta al
   propietario.
3. Añadir `GOOGLE_CLIENT_ID` (el compartido) en las propiedades del script.
4. Implementar como aplicación web y guardar la URL `/exec`.
5. Añadir los emails de los padres en la pestaña `Usuarios`, con `Activo = TRUE`.
6. Pasarles la URL de la PWA y su URL `/exec`.

Ellos: abrir, pegar la URL una vez, entrar con Google, añadir a pantalla de
inicio.

**Se puede hacer antes de que nazca el bebé.** Sin fecha de nacimiento el
dashboard muestra un aviso con enlace a Ajustes en vez de romperse, el historial
viene vacío y el día de vida es `null` hasta que la fecha llega. La aplicación
empieza a contar sola el día 0.
