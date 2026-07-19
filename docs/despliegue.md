# Guía de despliegue paso a paso

Lista ordenada de **todos los pasos manuales** para poner Baby Tracker en producción. Solo hay que hacerla una vez; al final tendrás la app instalada en los móviles y guardando en tu Google Sheets.

Tiempo estimado: 20–30 minutos.

**Necesitas**: una cuenta de Google, el repositorio en GitHub y (opcional, solo para probar en local) Node 20+.

Marca cada casilla al completarla.

---

## Fase 1 — Backend en Google Apps Script

### 1.1 Crear el proyecto

- [ ] Entra en [script.google.com](https://script.google.com) con tu cuenta de Google.
- [ ] Pulsa **Nuevo proyecto**.
- [ ] Arriba a la izquierda, renombra "Proyecto sin título" a `Baby Tracker API`.
- [ ] Abre **⚙️ Configuración del proyecto** (menú izquierdo) y marca **"Mostrar el archivo de manifiesto appsscript.json en el editor"**.

### 1.2 Copiar el código

Vuelve al **Editor** (menú izquierdo). Tienes que dejar el proyecto con 5 archivos, copiando el contenido desde la carpeta [`apps-script/`](../apps-script/) del repositorio:

- [ ] `appsscript.json` → sustituye su contenido por el de `apps-script/appsscript.json`.
- [ ] `Código.gs` → renómbralo a `Main` y pega el contenido de `apps-script/Main.js`.
- [ ] Con **+ → Secuencia de comandos** crea `Sheets` y pega `apps-script/Sheets.js`.
- [ ] Crea `Logic` y pega `apps-script/Logic.js`.
- [ ] Crea `Setup` y pega `apps-script/Setup.js`.
- [ ] Guarda todo (💾 o Cmd/Ctrl+S).

> Alternativa para no copiar a mano: con [clasp](https://github.com/google/clasp) — `cp apps-script/.clasp.json.example apps-script/.clasp.json`, pon el `scriptId` del proyecto (Configuración del proyecto → ID de secuencia de comandos) y ejecuta `npx clasp push` dentro de `apps-script/`.

### 1.3 Crear la hoja de cálculo (setup)

- [ ] En la barra del editor, selecciona la función **`setup`** en el desplegable y pulsa **Ejecutar**.
- [ ] La primera vez Google pedirá permisos: **Revisar permisos** → elige tu cuenta → aparecerá "Google no ha verificado esta aplicación" → **Configuración avanzada** → **Ir a Baby Tracker API (no seguro)** → **Permitir**. (Es tu propio script; el aviso es normal.)
- [ ] Mira el **Registro de ejecución**: debe decir `✔ Hoja de cálculo lista: https://docs.google.com/...` y avisar de que falta `GOOGLE_CLIENT_ID` (lo pondremos en la fase 3).
- [ ] Abre esa URL y comprueba que la hoja **Baby Tracker** tiene las pestañas **Usuarios** (con tu email ya dado de alta) y **Eventos** (solo cabeceras). Guárdala en marcadores: es tu base de datos.

> Si quieres usar una hoja ya existente en lugar de crear una nueva: antes de ejecutar `setup`, añade la propiedad `SPREADSHEET_ID` (ver fase 3.1) con el ID de tu hoja y ejecuta `setup` después; solo añadirá las pestañas/cabeceras que falten.

---

## Fase 2 — Client ID de OAuth (el login con Google)

### 2.1 Proyecto y pantalla de consentimiento

- [ ] Entra en [console.cloud.google.com](https://console.cloud.google.com) con la misma cuenta.
- [ ] Arriba, selector de proyectos → **Proyecto nuevo** → nombre `Baby Tracker` → **Crear** (es gratuito) → selecciónalo.
- [ ] Menú ☰ → **APIs y servicios → Pantalla de consentimiento de OAuth**.
- [ ] Tipo de usuario: **Externo** → **Crear**.
- [ ] Rellena lo mínimo: nombre de la app (`Baby Tracker`), tu email de asistencia y tu email de contacto → **Guardar y continuar** en el resto de pantallas (no añadas scopes).
- [ ] En la pantalla de consentimiento, pulsa **Publicar aplicación** (estado "En producción"). Con los permisos básicos de email/perfil no se requiere verificación de Google.
  - Si prefieres dejarla en **Testing**: tendrás que añadir en "Usuarios de prueba" cada email que vaya a usar la app.

### 2.2 Crear la credencial

- [ ] **APIs y servicios → Credenciales → + Crear credenciales → ID de cliente de OAuth**.
- [ ] Tipo de aplicación: **Aplicación web**. Nombre: `Baby Tracker Web`.
- [ ] En **Orígenes de JavaScript autorizados** añade (sin barra final y sin ruta):
  - `https://TU_USUARIO.github.io` ← donde publicarás el frontend
  - `http://localhost:5173` ← para desarrollo local
- [ ] **Crear** y copia el **ID de cliente** (acaba en `.apps.googleusercontent.com`). Lo usarás dos veces.

---

## Fase 3 — Conectar y publicar el backend

### 3.1 Propiedad del script

- [ ] Vuelve al editor de Apps Script → **⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos → Añadir propiedad**:
  - Propiedad: `GOOGLE_CLIENT_ID`
  - Valor: el ID de cliente de la fase 2.2
- [ ] Verás que `SPREADSHEET_ID` ya existe (lo creó `setup`). No lo toques.

### 3.2 Desplegar como aplicación web

- [ ] **Implementar → Nueva implementación**.
- [ ] Engranaje ⚙️ → tipo **Aplicación web**.
- [ ] Configura exactamente:
  - **Ejecutar como**: *Yo (tu email)*
  - **Quién tiene acceso**: *Cualquier persona*
- [ ] **Implementar** y copia la **URL de la aplicación web** (acaba en `/exec`).
- [ ] Comprobación: abre esa URL en el navegador. Debe responder `{"ok":true,"data":{"service":"baby-tracker",...}}`.

---

## Fase 4 — Publicar el frontend en GitHub Pages

- [ ] En tu repositorio de GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- [ ] **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable** (dos veces):
  - `VITE_API_URL` = la URL `/exec` de la fase 3.2
  - `VITE_GOOGLE_CLIENT_ID` = el ID de cliente de la fase 2.2
- [ ] Lanza el despliegue: pestaña **Actions → deploy → Run workflow** (o simplemente haz push a `main`).
- [ ] Espera a que el workflow acabe en verde y abre `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.
- [ ] Comprobación final: pulsa **Continuar con Google**, entra con tu cuenta y registra un evento de prueba. Abre la hoja de cálculo y comprueba que aparece la fila en **Eventos**. Después bórralo desde la cronología de la app.

---

## Fase 5 — Alta de usuarios e instalación en los móviles

### 5.1 Autorizar al segundo progenitor (y quien haga falta)

- [ ] Abre la hoja de cálculo, pestaña **Usuarios**, y añade una fila:

  | Usuario_ID | Email | Nombre | Activo | Rol | Fecha_Alta |
  |---|---|---|---|---|---|
  | u2 | pareja@gmail.com | Luis | TRUE | editor | 2026-07-19 |

- [ ] Solo si dejaste la pantalla de consentimiento en **Testing**: añade también ese email como usuario de prueba en Google Cloud Console.
- [ ] Pídele que entre en la URL y compruebe que puede iniciar sesión y registrar.

### 5.2 Instalar como app

- [ ] **Android (Chrome)**: abrir la URL → menú ⋮ → **Añadir a pantalla de inicio** / **Instalar aplicación**.
- [ ] **iPhone (Safari)**: abrir la URL → botón compartir → **Añadir a pantalla de inicio**.
- [ ] La app queda con su icono 🌙 y abre a pantalla completa.

---

## Errores comunes

| Síntoma | Causa y solución |
|---|---|
| "La cuenta X no está autorizada" al entrar | Ese email no está en la pestaña **Usuarios** con `Activo = TRUE`. Añádelo (fase 5.1). |
| El botón de Google no aparece o da error de origen | Falta el origen exacto en **Orígenes de JavaScript autorizados** (fase 2.2). Debe coincidir con el dominio, con https y sin barra final. Tras cambiarlo puede tardar unos minutos. |
| "Falta configurar GOOGLE_CLIENT_ID…" | No creaste la propiedad del script (fase 3.1). |
| "Falta configurar la URL de la API…" | La variable `VITE_API_URL` no estaba al hacer el build (fase 4); revisa Variables y relanza el workflow. |
| La URL `/exec` pide iniciar sesión en vez de responder JSON | La implementación no tiene acceso **Cualquier persona** o "Ejecutar como" no es **Yo** (fase 3.2). Crea una nueva implementación bien configurada. |
| "Google no ha verificado esta aplicación" a un usuario nuevo | La pantalla de consentimiento sigue en **Testing** y ese email no es usuario de prueba. Publica la app o añádelo (fase 2.1). |

## Mantenimiento

- **Actualizar el frontend**: push a `main`; el workflow lo publica solo.
- **Actualizar el backend**: pega el código nuevo en el editor y en **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL `/exec` no cambia.
- **Revocar el acceso de alguien**: pon `Activo = FALSE` en su fila de **Usuarios** (efecto inmediato).
- **Copia de seguridad**: los datos son la hoja de cálculo; con **Archivo → Hacer una copia** en Sheets es suficiente.
