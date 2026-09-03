import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Dexie precisa de um IndexedDB — não existe em Node puro. O
    // fake-indexeddb dá uma implementação em memória, suficiente para
    // testar a lógica sem precisar de navegador nem de browser headless.
    setupFiles: ['./src/db/testes-setup.ts'],
  },
})
