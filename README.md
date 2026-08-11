# Baby Tracker

Aplicación web móvil (PWA) para registrar de forma rápida y compartida la actividad diaria de un bebé: **sueño, tomas, pañales y baños**, con cronología diaria editable y **Google Sheets como única fuente de verdad**.

Es un **diario estructurado**, no un conjunto de cronómetros: da igual que un evento se anote en el momento, tres horas después o que se olvide. Lo que la aplicación muestra es siempre *lo que se ha registrado que ocurrió*, nunca una deducción sobre lo que está pasando ahora.

Pensada para usarse con una mano y en segundos, con valores por defecto tomados del último registro.

Las pautas de trabajo del proyecto están en [AGENTS.md](AGENTS.md).

## Qué hace

- **Acceso con Google**, restringido a los usuarios autorizados en la hoja `Usuarios`.
- **Cinco tipos de registro**: sueño, tomas, pañales, baños y peso. Todos con hora, nota opcional, autor y fecha de creación y de modificación.
- **Dos calendarios**: día de vida (24 h desde la hora exacta de nacimiento) o día natural (00:00–23:59). Se elige en la pantalla principal y en la cronología, y la preferencia se recuerda.
- **Pantalla principal**: contadores del tramo (pises, cacas, pedetes, tomas, hidratación y leche), cuánto hace del último de cada cosa, una franja de 24 h con lo que ha pasado y a qué hora, la última pesada con su variación, y accesos para registrar. Se puede navegar a tramos anteriores.
- **Una toma contiene varias tetadas y varios biberones**, cada uno con su hora. El intervalo y los totales de la toma se derivan de ellos.
- **Un rato al pecho de menos de 5 minutos cuenta como hidratación, no como toma**, y un pedete no cuenta como caca. El corte vale en todas las pantallas y en todos los contadores.
- **Sueño** con inicio y fin, registrable a posteriori, con cronómetro auxiliar de un toque. Un sueño sin cerrar no significa que el bebé siga dormido.
- **Pañales** con pis y caca independientes, cada uno con su cantidad, y la caca con su consistencia.
- **Cronología** por tramos, de lo más reciente a lo más antiguo, con filtro por tipo, huecos entre tomas y encadenado de tramos sin salir de la pantalla.
- **Evolución** de los últimos 14 días de vida en barras, y el peso en una gráfica con eje temporal real y la referencia del nacimiento.
- **Todo es corregible después**, desde la misma pantalla con la que se creó.
- **Reintentar nunca duplica**: el identificador se genera en el cliente.
- **Nada se da por guardado** si la hoja no confirmó la escritura.

> **Cómo funciona cada pantalla y con qué reglas se calcula cada cifra**:
> [docs/funcionamiento.md](docs/funcionamiento.md).

Cada tipo de registro tiene **su propia pestaña** en la hoja de cálculo, con sus columnas y su significado: añadir un campo es añadir una columna. El modelo completo está en [docs/modelo-de-datos.md](docs/modelo-de-datos.md), y el contrato de la API en [docs/api.md](docs/api.md).

## Arquitectura

```
┌─────────────────┐   POST JSON    ┌──────────────────┐   lee/escribe   ┌───────────────┐
│  PWA (Preact)   │ ─────────────► │ Google Apps      │ ──────────────► │ Google Sheets │
│  GitHub Pages   │ ◄───────────── │ Script (Web App) │ ◄────────────── │ Una pestaña   │
│  u otro estático│                │ API + sesiones   │                 │ por tipo      │
└─────────────────┘                └──────────────────┘                 └───────────────┘
        │
        └── Inicio de sesión con Google Identity Services (el backend verifica el token)
```

- **Frontend**: Vite + TypeScript + Preact, en [web/](web/). Sin más dependencias de ejecución. Hora local de Madrid en todo el dominio (`Europe/Madrid`).
- **Backend**: Google Apps Script, en [apps-script/](apps-script/). Cuatro archivos sin build. Verifica el ID token de Google, emite sesiones propias (180 días), valida cada registro y escribe en la hoja bajo bloqueo. Los tipos de registro se declaran en un único sitio (`RECORD_TYPES`) y el resto del backend es genérico.
- **Datos**: una hoja de cálculo con una pestaña por tipo (`Sueno`, `Tomas`, `Panales`, `Banos`, `Peso`), más `Usuarios` y `Bebe`. En `Tomas` hay **una fila por cada tetada y cada biberón**, unidas por `Toma_ID`. Borrado lógico en la columna `Eliminado`. Se puede editar a mano sin romper la aplicación.
- Todo el hosting utilizado (GitHub Pages, Apps Script, Sheets) es gratuito.

### Estructura del repositorio

```
web/                  Frontend PWA (Vite + Preact)
  src/lib/            Lógica pura con tests: fechas, día de vida, estado
                      derivado, formularios y resúmenes
  src/views/          Pantallas: login, dashboard, formularios, cronología, ajustes
  src/api/            Cliente de la API real y mock de desarrollo
  public/             Manifest, service worker, iconos
apps-script/          Backend Google Apps Script (Main, Sheets, Logic, Setup)
  test/               Tests del backend y simulación de la hoja en memoria
scripts/              Generador de iconos PNG
docs/funcionamiento.md  Qué hace cada pantalla y con qué reglas
docs/modelo-de-datos.md Pestañas, columnas y cómo añadir campos o tipos
docs/api.md             Acciones, errores y garantías de la API
docs/despliegue.md      Guía de despliegue paso a paso
docs/fotos.md           Evolutivo no implementado: fotos en los registros
docs/prediccion-sueno-tomas.md  Evolutivo no implementado: ventanas de sueño
docs/especificacion.md  Histórico: la especificación de la primera versión
.github/workflows/    Despliegue automático en GitHub Pages
```

## Instalación y despliegue

Necesitas una cuenta de Google y unos 20 minutos. Son tres piezas: la hoja + Apps Script (backend), un Client ID de OAuth (login con Google) y el frontend publicado.

> **Guía detallada con casillas de verificación**: [docs/despliegue.md](docs/despliegue.md) recorre todos los pasos manuales uno a uno, con comprobaciones tras cada fase y una tabla de errores comunes. Lo que sigue es el resumen.

### 1. Backend en Google Apps Script

1. Entra en [script.google.com](https://script.google.com) → **Nuevo proyecto**. Ponle nombre (p. ej. "Baby Tracker API").
2. En **Configuración del proyecto** activa **"Mostrar el archivo de manifiesto appsscript.json"**.
3. Copia el contenido de estos archivos del repositorio al proyecto (mismo nombre, un archivo de script por cada `.js`):
   - `apps-script/appsscript.json` → `appsscript.json`
   - `apps-script/Main.js`, `apps-script/Sheets.js`, `apps-script/Logic.js`, `apps-script/Setup.js`
   > Alternativa con [clasp](https://github.com/google/clasp): copia `apps-script/.clasp.json.example` a `apps-script/.clasp.json`, pon tu `scriptId` y ejecuta `npx clasp push` dentro de `apps-script/`.
4. Ejecuta la función **`setup`** (selector de funciones → `setup` → Ejecutar) y autoriza los permisos. En el registro verás la URL de la hoja de cálculo creada, con una pestaña por tipo de registro (`Sueno`, `Tomas`, `Panales`, `Banos`, `Peso`), más `Usuarios` (tú ya estás dado de alta) y `Bebe`.
   - Si prefieres usar una hoja existente, añade antes la propiedad `SPREADSHEET_ID` (paso 3.2) y ejecuta `setup` después.

### 2. Client ID de OAuth (login con Google)

1. En [Google Cloud Console](https://console.cloud.google.com) crea un proyecto (gratuito).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo **Externo**, rellena los datos mínimos y **publica la aplicación** (con los scopes básicos de email/perfil no requiere verificación). Si la dejas en "Testing", añade como usuarios de prueba los emails que vayan a usar la app.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**: tipo **Aplicación web**. En **Orígenes de JavaScript autorizados** añade:
   - `https://TU_USUARIO.github.io` (o el dominio donde publiques el frontend)
   - `http://localhost:5173` (para desarrollo local)
4. Copia el **Client ID** (termina en `.apps.googleusercontent.com`).

### 3. Conectar y desplegar el backend

1. En el editor de Apps Script: **Configuración del proyecto → Propiedades de la secuencia de comandos** → añade `GOOGLE_CLIENT_ID` con el Client ID del paso anterior.
2. (Opcional) `SPREADSHEET_ID` ya estará creado por `setup`; cámbialo si quieres apuntar a otra hoja.
3. **Implementar → Nueva implementación → Aplicación web**:
   - **Ejecutar como**: Yo.
   - **Quién tiene acceso**: Cualquier persona.
4. Copia la **URL de la aplicación web** (termina en `/exec`). Puedes comprobarla abriéndola en el navegador: debe responder `{"ok":true,...}`.

> Tras cambiar el código del backend hay que crear una **nueva implementación** (o actualizar la existente con "Administrar implementaciones → editar → nueva versión"); la URL `/exec` se mantiene si actualizas la misma implementación.

### 4. Frontend en GitHub Pages

1. En el repositorio de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** → añade:
   - `VITE_API_URL`: la URL `/exec` del paso 3.
   - `VITE_GOOGLE_CLIENT_ID`: el Client ID del paso 2.
3. Haz push a `main` (o lanza el workflow **deploy** a mano). La app quedará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

Para cualquier otro hosting estático: `npm run build` con las dos variables en `.env` y sirve `web/dist/`.

### 5. Dar de alta a más usuarios

Añade una fila en la pestaña `Usuarios` de la hoja de cálculo:

| Usuario_ID | Email | Nombre | Activo | Rol | Fecha_Alta |
|---|---|---|---|---|---|
| cualquier-texto-único | pareja@gmail.com | Luis | TRUE | editor | 2026-07-19 |

`Activo = FALSE` revoca el acceso al momento. El `Nombre` es el que se muestra junto a cada registro.

### 6. Instalar en el móvil

Abre la URL en el navegador del teléfono y usa **"Añadir a pantalla de inicio"**. La app se instala como PWA con su icono y arranque instantáneo.

## Desarrollo local

```bash
npm install
cp .env.example .env    # con VITE_USE_MOCK=1 no necesitas nada de Google
npm run dev             # http://localhost:5173
npm test                # tests de la lógica crítica (frontend y backend)
npm run build           # typecheck + build de producción en web/dist
```

Con `VITE_USE_MOCK=1` la app usa una API en memoria con datos de ejemplo (botón "Entrar (modo demo)"): sirve para desarrollar la interfaz sin tocar Google. Para probar contra el backend real, rellena `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID` en `.env` y quita `VITE_USE_MOCK`.

No hay credenciales en el repositorio: la URL de la API y el Client ID (públicos por naturaleza, pero propios de cada despliegue) viven en `.env` local o en las variables de Actions; los secretos reales (sesiones) solo existen en las propiedades del script de Apps Script.

## Detalles técnicos

Lo que hace cada pantalla está en [docs/funcionamiento.md](docs/funcionamiento.md).
Esto es cómo se sostiene por debajo.

- **Zona horaria**: todo se guarda y se muestra en hora de Madrid (`Europe/Madrid`), independientemente del dispositivo. Formato `yyyy-MM-dd HH:mm` en la hoja, como texto, para que Sheets no reinterprete nada.
- **Identificadores**: los genera el cliente (UUID) antes de enviar. Un reintento devuelve el registro ya guardado en lugar de crear otro.
- **Escrituras bajo bloqueo global** de Apps Script: dos móviles guardando a la vez no se pisan.
- **Borrado lógico**: la fila se marca en la columna `Eliminado` y deja de leerse, pero la hoja conserva el histórico.
- **Edición manual de la hoja**: tolerada. Las columnas se localizan por cabecera —se pueden reordenar o añadir otras—, las etiquetas admiten variantes sin acentos, las fechas aceptan `dd/MM/yyyy`, las horas sueltas (`HH:mm`) se combinan con la columna `Fecha`, un fin menor que el inicio se interpreta como cruce de medianoche y una casilla marcada con `x` cuenta como `TRUE`. Las duraciones y los totales se recalculan siempre al leer.
- **Latencia**: Apps Script tarda 1-3 s por operación. La interfaz pinta lo último cargado mientras refresca y solo confirma cuando la hoja ha escrito. Los días que hacen falta a la vez se piden **en paralelo** y se pintan según llegan, y una misma fecha nunca se pide dos veces a la vez.
- **Tolerancia a fallos**: los errores pasajeros se reintentan solos (dos veces, con espera creciente); los definitivos se muestran al momento. Un día que no carga se señala en vez de omitirse, y un fallo pintando muestra una salida en lugar de dejar la pantalla en negro.
- **Sin conexión**: se requiere internet. El service worker cachea la aplicación, no los datos.
- **Rendimiento**: cada petición lee las cinco pestañas de registros más `Usuarios` y `Bebe`. Con el volumen de un bebé son décimas de segundo; si algún día se nota, la salida está descrita en [docs/modelo-de-datos.md](docs/modelo-de-datos.md#rendimiento).

## Actualizar un despliegue existente

1. Copia los cuatro archivos de [apps-script/](apps-script/) al proyecto de Apps Script y guarda. Producción no se entera todavía: sigue sirviendo la versión anterior.
2. Si el cambio añade columnas, ejecuta **`setup`**. Solo añade al final de cada pestaña lo que falte: no reordena, no borra y no toca los datos. Es seguro ejecutarlo tantas veces como quieras.
3. **Implementar → Administrar implementaciones → editar → nueva versión.** La URL `/exec` no cambia.
4. Haz push a `main`: GitHub Pages republica el frontend solo.

Si un cambio toca las dos partes, entre los pasos 3 y 4 hay unos minutos en los que una versión habla con la otra. Para evitarlos, crea una **implementación nueva** con su propia URL y apunta `VITE_API_URL` a ella.

> Viniendo de la versión 1: la pestaña `Eventos` se deja intacta y deja de leerse. Consérvala como histórico y bórrala a mano cuando no haga falta.

## Funcionalidad futura

Cola local sin conexión con sincronización, recordatorios, estadísticas semanales/mensuales, ventanas de sueño ([diseño](docs/prediccion-sueno-tomas.md)), medicación, hitos, exportaciones y fotos en los registros ([análisis](docs/fotos.md)).

Cómo añadir un campo o un tipo de registro nuevo: [docs/modelo-de-datos.md](docs/modelo-de-datos.md#cómo-añadir-un-campo-a-un-tipo).
