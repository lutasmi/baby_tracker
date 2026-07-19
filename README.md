# Baby Tracker

Aplicación web móvil (PWA) para registrar de forma rápida y compartida la actividad diaria de un bebé: **sueño, tomas, pañales y baños**, con cronología diaria editable y **Google Sheets como única fuente de verdad**.

Pensada para usarse con una mano y en segundos: las acciones habituales (se ha dormido, se ha despertado, toma, pañal) están a uno o dos toques desde la pantalla principal, con valores por defecto basados en el último registro.

La especificación completa del producto está en [docs/especificacion.md](docs/especificacion.md) y las pautas del proyecto en [AGENTS.md](AGENTS.md).

## Qué incluye la V1

- **Acceso con Google** restringido a los usuarios autorizados en la hoja `Usuarios`.
- **Pantalla principal**: tiempo dormido/despierto en tiempo real, última toma, último pañal, total dormido hoy y botones grandes de registro.
- **Sueño**: iniciar/finalizar de un toque, registro manual de sueños pasados, siesta o nocturno, imposible tener dos sueños activos.
- **Tomas**: biberón (cantidad y tipo de leche) o lactancia (duración y pecho, alternando el último usado). Cada tipo muestra solo sus campos.
- **Pañales**: pipí/caca/ambos; la consistencia solo aparece cuando hay caca.
- **Baños**: completo o aseo rápido, con duración opcional.
- **Cronología diaria** con resumen del día, cambio de fecha, edición y borrado con confirmación.
- Cada registro guarda **quién lo creó, quién lo modificó y cuándo**.
- Reintentos seguros: el identificador se genera en el cliente y **repetir una petición nunca duplica** el registro.
- Errores de red visibles y con reintento manual; nada se marca como guardado si la hoja no confirmó la escritura.

## Arquitectura

```
┌─────────────────┐   POST JSON    ┌──────────────────┐   lee/escribe   ┌───────────────┐
│  PWA (Preact)   │ ─────────────► │ Google Apps      │ ──────────────► │ Google Sheets │
│  GitHub Pages   │ ◄───────────── │ Script (Web App) │ ◄────────────── │ Usuarios ·    │
│  u otro estático│                │ API + sesiones   │                 │ Eventos       │
└─────────────────┘                └──────────────────┘                 └───────────────┘
        │
        └── Inicio de sesión con Google Identity Services (el backend verifica el token)
```

- **Frontend**: Vite + TypeScript + Preact, en [web/](web/). Sin más dependencias de ejecución. Hora local de Madrid en todo el dominio (`Europe/Madrid`).
- **Backend**: Google Apps Script, en [apps-script/](apps-script/). Cuatro archivos sin build. Verifica el ID token de Google, emite sesiones propias (180 días), valida cada evento y escribe en la hoja bajo bloqueo.
- **Datos**: una hoja de cálculo con las pestañas `Usuarios` y `Eventos` (una fila por evento, borrado lógico en la columna `Eliminado`). Se puede editar a mano sin romper la aplicación.
- Todo el hosting utilizado (GitHub Pages, Apps Script, Sheets) es gratuito.

### Estructura del repositorio

```
web/                  Frontend PWA (Vite + Preact)
  src/lib/            Lógica pura (fechas, estado del bebé, resúmenes) con tests
  src/views/          Pantallas: login, dashboard, formularios, cronología
  src/api/            Cliente de la API real y mock de desarrollo
  public/             Manifest, service worker, iconos
apps-script/          Backend Google Apps Script (Main, Sheets, Logic, Setup)
  test/               Tests de la lógica del backend (se ejecutan en Node)
scripts/              Generador de iconos PNG
docs/especificacion.md  Especificación original del producto
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
4. Ejecuta la función **`setup`** (selector de funciones → `setup` → Ejecutar) y autoriza los permisos. En el registro verás la URL de la hoja de cálculo creada, con las pestañas `Usuarios` (tú ya estás dado de alta) y `Eventos`.
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

## Detalles de funcionamiento

- **Zona horaria**: todo se guarda y se muestra en hora de Madrid (`Europe/Madrid`), independientemente del dispositivo. Formato `yyyy-MM-dd HH:mm` en la hoja.
- **Duplicados**: el cliente genera el `Evento_ID` (UUID) antes de enviar; si un reintento llega dos veces, el backend devuelve el registro ya guardado.
- **Sueño activo único**: lo garantiza el backend bajo bloqueo global; si dos móviles lo intentan a la vez, el segundo recibe un error claro.
- **Edición manual de la hoja**: tolerada. Las columnas se localizan por cabecera, las etiquetas admiten variantes sin acentos, las horas sueltas (`HH:mm`) se combinan con la columna `Fecha` y un fin menor que el inicio se interpreta como cruce de medianoche.
- **Borrado**: lógico (columna `Eliminado`), para que la hoja conserve el histórico.
- **Latencia**: Apps Script tarda 1–3 s por operación; la interfaz muestra el estado de guardado y solo confirma cuando la hoja ha escrito.
- **Sin conexión**: la V1 requiere internet. El service worker solo cachea la aplicación (no los datos) para que abra al instante; la arquitectura deja el terreno preparado para una cola local en el futuro.

## Funcionalidad futura (fuera de la V1)

Cola local sin conexión con sincronización, recordatorios, estadísticas semanales/mensuales, ventanas de sueño, medicación, crecimiento, hitos y exportaciones. Añadir un nuevo tipo de evento requiere: una entrada en los mapas de etiquetas del backend (`Logic.js`), un formulario y los textos de resumen en el frontend.
