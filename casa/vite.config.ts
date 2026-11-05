import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La build la sirve el servidor de la oficina en /casa/ (ver servidor/server.mjs).
export default defineConfig({
  base: '/casa/',
  plugins: [react()],
  resolve: {
    alias: { '@jules/oficina': fileURLToPath(new URL('./src/oficina/index.ts', import.meta.url)) },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
