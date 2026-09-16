import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/aot/',
  // Addons and game modules must share the WebGPU build of Three.js.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: {
    rolldownOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        characters: fileURLToPath(new URL('./characters.html', import.meta.url)),
      },
    },
  },
});
