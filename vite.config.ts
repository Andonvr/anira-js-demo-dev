import { defineConfig } from 'vite'

const CORS_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  base: '/',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0, // Never inline WASM files
    rollupOptions: {
      input: {
        main: './index.html',
        'simple-gain-stereo': './simple-gain-stereo.html',
        'streaming-gain-stereo': './streaming-gain-stereo.html',
        'js-callback': './js-callback.html',
        'onnx-runtime-web-backend': './onnx-runtime-web-backend.html',
        'js-copying': './js-copying.html',
      },
      output: { format: 'es' },
    },
  },
  worker: { format: 'es' },
  server: { headers: CORS_HEADERS, fs: { strict: false } },
  preview: { headers: CORS_HEADERS },
})
