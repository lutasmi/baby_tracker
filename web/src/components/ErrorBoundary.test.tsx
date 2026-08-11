// La red de seguridad ante un fallo pintando.
//
// Lo que Preact hace —llamar a `getDerivedStateFromError` cuando un hijo
// revienta— es comportamiento del framework y necesitaría un DOM de verdad
// para ejercitarlo. Aquí se prueba lo que sí es nuestro: que ese estado se
// produce y que con él se pinta una salida en lugar de nada.

import type { VNode } from 'preact'
import render from 'preact-render-to-string'
import { describe, expect, it } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

/** El componente tal y como queda tras atrapar un error. */
function caido(error: Error) {
  const boundary = new ErrorBoundary({ children: null })
  boundary.state = ErrorBoundary.getDerivedStateFromError(error)
  // Con estado de error, `render` devuelve siempre la pantalla de salida.
  return render(boundary.render() as VNode)
}

describe('ErrorBoundary', () => {
  it('un fallo deja una pantalla con explicación y salida', () => {
    const html = caido(new Error('columna inesperada'))
    expect(html).toContain('Algo ha fallado')
    // El mensaje concreto, que es lo que permite diagnosticarlo.
    expect(html).toContain('columna inesperada')
    // Y dos formas de salir, para no dejar la aplicación bloqueada.
    expect(html).toContain('Reintentar')
    expect(html).toContain('Ir al inicio')
  })

  it('deja claro que lo registrado no se ha perdido', () => {
    expect(caido(new Error('x'))).toContain('Los datos están a salvo')
  })

  it('sin error, pinta su contenido tal cual', () => {
    const html = render(
      <ErrorBoundary>
        <p>contenido</p>
      </ErrorBoundary>
    )
    expect(html).toBe('<p>contenido</p>')
  })

  it('cambiar de pantalla borra el error: uno no atrapa a la siguiente', () => {
    const conError = { error: new Error('x'), key: '#/cronologia' }
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: '#/' }, conError)).toEqual({
      error: null,
      key: '#/',
    })
    // Y quedarse en la misma pantalla no lo borra solo.
    expect(
      ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: '#/cronologia' }, conError)
    ).toBeNull()
  })
})
