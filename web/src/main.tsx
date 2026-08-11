import { render } from 'preact'
import { initApi } from './api'
import './styles.css'
import { App } from './app'
import { showToast } from './toast'

// La API (real o mock) se resuelve antes de pintar nada. Si eso falla, la
// página se quedaría en blanco sin decir nada: mejor un mensaje y un botón.
void initApi()
  .then(() => {
    render(<App />, document.getElementById('app')!)
  })
  .catch((err: unknown) => {
    console.error('No se pudo arrancar la aplicación:', err)
    const root = document.getElementById('app')
    if (root) {
      root.innerHTML =
        '<main class="app-main"><div class="card"><div class="card-title">No se pudo arrancar</div>' +
        '<p class="field-hint">Recarga la página. Si persiste, comprueba la conexión.</p></div></main>'
    }
  })

// Lo que se escapa de los try/catch acaba aquí: sin esto, un fallo así se
// pierde en la consola del móvil, que nadie mira.
window.addEventListener('error', (e) => reportUnexpected(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason))

let lastReport = 0
function reportUnexpected(cause: unknown) {
  console.error('Error no controlado:', cause)
  // Un fallo en bucle no puede convertirse en una lluvia de avisos.
  if (Date.now() - lastReport < 10000) return
  lastReport = Date.now()
  showToast('Algo ha fallado. Si se repite, recarga la aplicación.', 'error')
}

// Service worker solo en producción; en desarrollo interferiría con Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Sin service worker la aplicación funciona igualmente (solo pierde la caché).
  })
}
