/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// El frontend vive en web/. El directorio de variables de entorno es la raíz
// del repositorio para que un único .env sirva a todo el proyecto.
export default defineConfig({
  root: 'web',
  envDir: '..',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../apps-script/test/**/*.test.js'],
  },
})
