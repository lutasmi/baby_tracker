# Baby Tracker

Aplicación web móvil (PWA) para registrar de forma rápida y compartida la actividad diaria de un bebé: **sueño, tomas, pañales y baños**, con cronología diaria editable y **Google Sheets como única fuente de verdad**.

Es un **diario estructurado**, no un conjunto de cronómetros: da igual que un evento se anote en el momento, tres horas después o que se olvide. Lo que la aplicación muestra es siempre *lo que se ha registrado que ocurrió*, nunca una deducción sobre lo que está pasando ahora.

Pensada para usarse con una mano y en segundos, con valores por defecto tomados del último registro.

La especificación original está en [docs/especificacion.md](docs/especificacion.md) y las pautas del proyecto en [AGENTS.md](AGENTS.md).

## Qué incluye

- **Acceso con Google** restringido a los usuarios autorizados en la hoja `Usuarios`.
- **Día de vida**: periodos de 24 h contados desde la hora exacta de nacimiento, con el recuento de pises, cacas, fórmula y leche materna extraída, y cuánto hace del último de cada cosa. Convive con el día natural, que sigue rigiendo la cronología.
- **Tomas con inicio y fin reales**, duración derivada y precisión de un minuto. Una misma toma puede combinar **pecho directo (min), leche materna extraída (ml) y fórmula (ml)**; los minutos y los mililitros nunca se mezclan.
- **Sueño** con inicio y fin, registrable después de que haya ocurrido. El cronómetro de un toque sigue estando, pero es auxiliar: la aplicación no da por hecho que el bebé sigue dormido porque nadie cerró un sueño.
- **Pañales**: pis y caca son casillas independientes, así que un pañal puede llevar las dos; la consistencia solo aparece cuando hay caca.
- **Baños**: completo o aseo rápido, con duración opcional.
- **Tiempo desde la toma anterior**, al registrar una toma y en cada toma de la cronología, para no tener que restar.
- **Peso**: cada pesada con su hora, y la variación en gramos y en porcentaje respecto al peso al nacer. Se muestra el dato, sin interpretarlo.
- **Cronología** como línea de tiempo, con la hora a la izquierda y cabecera pegajosa por día. "Ver ayer" encadena el día anterior debajo sin perder de vista el actual, y los huecos entre tomas se calculan de un día al siguiente.
- **Evolución** por días de vida: pises, cacas y leche en barras comparables, y el histórico de peso con su variación.
- **Lo último registrado se corrige desde la pantalla principal**: cada contador y cada casilla abren su registro.
- **Todo es corregible después**: horas, cantidades, componentes de una toma y contenido del pañal, con la misma pantalla con la que se creó.
- Cada registro guarda **quién lo creó, quién lo modificó y cuándo**.
- Reintentos seguros: el identificador se genera en el cliente y **repetir una petición nunca duplica** el registro.
- Errores de red visibles y con reintento manual; nada se marca como guardado si la hoja no confirmó la escritura.

Cada tipo de registro tiene **su propia pestaña** en la hoja de cálculo, con sus columnas y su significado: añadir un campo es añadir una columna. El modelo completo está en [docs/modelo-de-datos.md](docs/modelo-de-datos.md).

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
- **Datos**: una hoja de cálculo con una pestaña por tipo (`Sueno`, `Tomas`, `Panales`, `Banos`, `Peso`), más `Usuarios` y `Bebe`. Borrado lógico en la columna `Eliminado`. Se puede editar a mano sin romper la aplicación.
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
docs/modelo-de-datos.md Pestañas, columnas y cómo añadir campos o tipos
docs/especificacion.md  Especificación original del producto (contrato de la V1)
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

## Detalles de funcionamiento

- **Zona horaria**: todo se guarda y se muestra en hora de Madrid (`Europe/Madrid`), independientemente del dispositivo. Formato `yyyy-MM-dd HH:mm` en la hoja.
- **Duplicados**: el cliente genera el `ID` (UUID) antes de enviar; si un reintento llega dos veces, el backend devuelve el registro ya guardado.
- **Un solo sueño abierto**: lo garantiza el backend bajo bloqueo global. Un sueño sin cerrar **no** significa que el bebé siga dormido: pasadas 14 horas se considera un cronómetro olvidado, deja de contar en las horas dormidas y la pantalla principal ofrece corregirlo.
- **Componentes de la toma**: cada magnitud tiene su columna en la pestaña `Tomas` (`Pecho_Min`, `Extraida_Ml`, `Formula_Ml`). Los minutos y los mililitros no se convierten entre sí en ningún punto: del pecho directo no sabemos cuántos ml ha tomado el bebé.
- **Día de vida**: periodos de 24 h desde el instante del nacimiento. Un registro cuenta en el periodo en el que empieza, así que una toma que cruza el aniversario horario no se parte en dos.
- **Datos del bebé** (nacimiento y peso al nacer): viven en la pestaña `Bebe`, una sola fila. Son comunes a todos los usuarios y se editan desde la pantalla de Ajustes o a mano en la hoja.
- **Nada de recomendaciones**: la aplicación no propone objetivos de alimentación, no dice si un peso es normal ni avisa de que lleváis mucho sin registrar. Muestra lo registrado y deja el juicio a los padres y al pediatra.
- **Hueco entre tomas**: se mide de inicio a inicio, que es como se cuenta lo de "cada tres horas".
- **Días naturales y días de vida conviven**: la pantalla principal y la evolución van por días de vida; la cronología, por días naturales, y lo dice en su cabecera para que no haya duda.
- **El peso no se dibuja con barras**: como no empezarían en cero, un cambio de 50 g parecería enorme. Se muestra la cifra y la variación.
- **Edición manual de la hoja**: tolerada. Las columnas se localizan por cabecera —puedes reordenarlas o añadir las tuyas—, las etiquetas admiten variantes sin acentos, las fechas aceptan `dd/MM/yyyy`, las horas sueltas (`HH:mm`) se combinan con la columna `Fecha`, un fin menor que el inicio se interpreta como cruce de medianoche y una casilla marcada con `x` cuenta como `TRUE`. La duración se recalcula siempre desde el intervalo.
- **Borrado**: lógico (columna `Eliminado`), para que la hoja conserve el histórico.
- **Latencia**: Apps Script tarda 1–3 s por operación; la interfaz muestra el estado de guardado y solo confirma cuando la hoja ha escrito.
- **Sin conexión**: se requiere internet. El service worker solo cachea la aplicación (no los datos) para que abra al instante; la arquitectura deja el terreno preparado para una cola local en el futuro.

## Actualizar desde una versión anterior

El frontend y el backend cambian a la vez y **no son compatibles entre sí**: hay que hacer los dos pasos seguidos.

1. Copia el código nuevo al proyecto de Apps Script y ejecuta **`setup()`**. Crea las pestañas que falten sin tocar las que ya existen; la app en producción sigue funcionando porque todavía sirve la implementación anterior.
2. Reintroduce los registros que quieras conservar en las pestañas nuevas. La pestaña `Eventos` de la versión 1 se deja intacta y deja de leerse: consérvala como histórico y bórrala a mano cuando ya no te haga falta.
3. Fusiona a `main` (GitHub Pages se republica solo) y, justo después, **crea una nueva versión de la implementación** (*Implementar → Administrar implementaciones → editar → nueva versión*).

Entre los pasos 3a y 3b hay unos minutos en los que la aplicación puede dar error. Si prefieres evitarlos, crea una **implementación nueva** con su propia URL, apunta `VITE_API_URL` a ella y así cada versión del frontend habla con su backend.

`setup()` es seguro de ejecutar tantas veces como quieras: solo añade lo que falta y nunca reordena ni borra columnas.

## Funcionalidad futura

Cola local sin conexión con sincronización, recordatorios, estadísticas semanales/mensuales, ventanas de sueño ([diseño](docs/prediccion-sueno-tomas.md)), medicación, hitos y exportaciones.

Añadir un tipo de evento nuevo requiere: una entrada en los mapas de etiquetas del backend (`Logic.js`), un formulario y los textos de resumen en el frontend.
