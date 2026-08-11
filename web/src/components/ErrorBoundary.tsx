// Red de seguridad ante un fallo pintando.
//
// Sin esto, una excepción durante el render deja la aplicación en negro y sin
// salida: no hay mensaje, no hay botón y recargar es la única opción. Aquí se
// captura, se enseña qué pasó y se ofrece volver a intentarlo.

import { Component, type ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
  /** Cambia al navegar: un error de una pantalla no debe atrapar a la siguiente. */
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromProps(props: Props, state: State & { key?: string }) {
    // Al cambiar de pantalla se vuelve a intentar pintar.
    if (state.key !== props.resetKey) return { error: null, key: props.resetKey }
    return null
  }


  /** Pintar la salida es cosa del estado; esto es lo que lo pone. */
  static getDerivedStateFromError(error: Error): State {
    return { error: error }
  }

  componentDidCatch(error: Error) {
    // Queda en la consola con su traza para poder diagnosticarlo.
    console.error('Fallo al pintar la pantalla:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main class="app-main">
        <div class="card">
          <div class="card-title">Algo ha fallado</div>
          <p class="field-hint">
            La pantalla no se ha podido pintar. Los datos están a salvo: esto es un fallo de la
            aplicación, no de lo registrado.
          </p>
          <p class="field-hint" style="margin-top:8px">
            <code>{this.state.error.message}</code>
          </p>
          <div class="nav-pair" style="margin-top:14px">
            <button class="btn" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
            <button
              class="btn btn-primary"
              onClick={() => {
                location.hash = '#/'
                this.setState({ error: null })
              }}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </main>
    )
  }
}
