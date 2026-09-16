import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/aot/',
  plugins: [VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.js',
    injectRegister: false,
    manifest: false,
    injectManifest: {
      globPatterns: ['**/*.{html,js,css,json,glb,png,jpg,jpeg,webp,svg,ico,mp3,woff,woff2}'],
      // Eren is currently about 13 MiB; Workbox's default 2 MiB would exclude it.
      maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
    },
  })],
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
