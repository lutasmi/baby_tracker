import { render } from 'preact'
import './styles.css'
import { App } from './app'

render(<App />, document.getElementById('app')!)

// Service worker solo en producción; en desarrollo interferiría con Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Sin service worker la aplicación funciona igualmente (solo pierde la caché).
  })
}
