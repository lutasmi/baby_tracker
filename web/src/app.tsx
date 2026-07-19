import { useEffect, useState } from 'preact/hooks'
import { getApi } from './api'
import { useOnline, useRoute } from './hooks'
import { clearSession, loadSession, saveSession, type Session } from './session'
import { clearDayCache } from './store'
import { showToast, subscribeToast, type Toast } from './toast'
import { Dashboard } from './views/Dashboard'
import { Login } from './views/Login'

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const online = useOnline()

  // La capa de API avisa cuando la sesión caduca o se revoca.
  useEffect(() => {
    const onForcedLogout = (e: Event) => {
      setSession(null)
      clearDayCache()
      const message = (e as CustomEvent<string>).detail
      if (message) showToast(message, 'error')
    }
    window.addEventListener('babytracker:logout', onForcedLogout)
    return () => window.removeEventListener('babytracker:logout', onForcedLogout)
  }, [])

  function handleLogin(s: Session) {
    saveSession(s)
    setSession(s)
    location.hash = '#/'
  }

  function handleLogout() {
    void getApi()
      .logout()
      .catch(() => {
        // La sesión local se cierra igualmente; la remota caduca sola.
      })
    clearSession()
    clearDayCache()
    setSession(null)
  }

  if (!session) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <ToastHost />
      </>
    )
  }

  return (
    <div class="app">
      {!online && <div class="banner banner-offline">📡 Sin conexión a internet</div>}
      <Screen session={session} onLogout={handleLogout} />
      <ToastHost />
    </div>
  )
}

function Screen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const route = useRoute()
  void route
  return <Dashboard user={session.user} onLogout={onLogout} />
}

function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => subscribeToast(setToast), [])
  if (!toast) return null
  return <div class={`toast${toast.kind === 'error' ? ' toast-error' : ''}`}>{toast.message}</div>
}
