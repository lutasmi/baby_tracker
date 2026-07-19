import { useEffect, useRef, useState } from 'preact/hooks'
import { getApi, usingMock } from '../api'
import { ApiError } from '../api/types'
import { renderGoogleButton } from '../auth'
import type { Session } from '../session'

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const buttonHost = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function exchangeToken(idToken: string) {
    setWorking(true)
    setError(null)
    try {
      const { token, user } = await getApi().login(idToken)
      onLogin({ token, user })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión. Reinténtalo.')
    } finally {
      setWorking(false)
    }
  }

  useEffect(() => {
    if (usingMock || !buttonHost.current) return
    renderGoogleButton(buttonHost.current, (idToken) => void exchangeToken(idToken)).catch(
      (err: Error) => setError(err.message)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div class="app">
      <div class="login-screen">
        <div class="logo">🍼</div>
        <h2>Baby Tracker</h2>
        <p>Registro rápido y compartido del día a día del bebé.</p>
        {error && <div class="login-error">{error}</div>}
        {working ? (
          <div class="spinner" />
        ) : usingMock ? (
          <button class="btn btn-primary btn-lg" onClick={() => void exchangeToken('mock')}>
            Entrar (modo demo)
          </button>
        ) : (
          <div ref={buttonHost} />
        )}
      </div>
    </div>
  )
}
