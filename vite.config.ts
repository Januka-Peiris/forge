import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    // Pre-bundle icons in dev to avoid huge per-request fan-out from bare lucide-react imports.
    include: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('@tauri-apps')) return 'tauri';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
