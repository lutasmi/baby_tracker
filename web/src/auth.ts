// Integración con Google Identity Services (el botón "Continuar con Google").
// El script gsi/client se carga desde index.html; aquí solo se espera a que
// esté disponible y se pinta el botón.

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

interface GsiCredentialResponse {
  credential: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string
            callback: (response: GsiCredentialResponse) => void
          }): void
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void
        }
      }
    }
  }
}

function waitForGsi(timeoutMs = 10000): Promise<NonNullable<Window['google']>> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      if (window.google?.accounts?.id) return resolve(window.google)
      if (Date.now() - started > timeoutMs) {
        return reject(new Error('No se pudo cargar el inicio de sesión de Google.'))
      }
      setTimeout(check, 100)
    }
    check()
  })
}

/**
 * Pinta el botón de Google dentro de `container`. Cuando el usuario inicia
 * sesión, llama a `onToken` con el ID token para canjearlo en el backend.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onToken: (idToken: string) => void
): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('Falta configurar el Client ID de Google (VITE_GOOGLE_CLIENT_ID).')
  }
  const google = await waitForGsi()
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response) => onToken(response.credential),
  })
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    locale: 'es',
    width: 280,
  })
}
