// Avisos breves ("Guardado", errores...). Un único toast visible a la vez.

export interface Toast {
  message: string
  kind: 'ok' | 'error'
}

let listener: ((t: Toast | null) => void) | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export function showToast(message: string, kind: Toast['kind'] = 'ok'): void {
  listener?.({ message, kind })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => listener?.(null), kind === 'error' ? 4000 : 2200)
}

export function subscribeToast(fn: (t: Toast | null) => void): () => void {
  listener = fn
  return () => {
    listener = null
  }
}
