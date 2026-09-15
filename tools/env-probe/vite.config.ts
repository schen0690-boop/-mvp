import { defineConfig } from 'vite';

// Environment sample only. No application routes or business event protocol.
export default defineConfig({
  build: { outDir: 'dist/client' },
  preview: {
    host: '127.0.0.1', port: 41731, strictPort: true,
    proxy: { '/probe': 'http://127.0.0.1:41732' },
  },
});
