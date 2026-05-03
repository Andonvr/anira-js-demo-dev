import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import license from 'rollup-plugin-license'
import * as fs from 'node:fs'
import * as path from 'node:path'

// anira-web pre-bundles onnxruntime-web, so rollup-plugin-license can't see
// it as a transitive dep. List packages here that are inlined into other
// bundled deps and need attribution anyway.
const INLINED_BUNDLED_DEPS = ['onnxruntime-web']

function readInlinedDep(name: string) {
  const dir = path.resolve(__dirname, 'node_modules', name)
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const licenseFile = ['LICENSE', 'LICENSE.txt', 'LICENSE.md']
    .map((f) => path.join(dir, f))
    .find((p) => fs.existsSync(p))
  return {
    name: pkg.name,
    version: pkg.version,
    homepage: pkg.homepage ?? pkg.repository?.url,
    license: pkg.license,
    licenseText: licenseFile ? fs.readFileSync(licenseFile, 'utf8') : null,
  }
}

const CORS_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/coi-serviceworker/coi-serviceworker.min.js',
          dest: '.',
        },
      ],
    }),
  ],
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
        'pre-post-processors': './pre-post-processors.html',
        'steerable-nafx': './steerable-nafx.html',
        'guitar-lstm': './guitar-lstm.html',
        licenses: './licenses.html',
      },
      output: { format: 'es' },
      plugins: [
        license({
          thirdParty: {
            includePrivate: false,
            output: {
              file: path.resolve(__dirname, 'dist', 'THIRD_PARTY_LICENSES.txt'),
              template(deps) {
                const all = [...deps, ...INLINED_BUNDLED_DEPS.map(readInlinedDep)]
                return all
                  .map(
                    (d) =>
                      `${'='.repeat(80)}\n` +
                      `${d.name}@${d.version}` +
                      (d.homepage ? `\n${d.homepage}` : '') +
                      `\nLicense: ${d.license ?? 'UNKNOWN'}\n` +
                      `${'='.repeat(80)}\n\n` +
                      (d.licenseText ?? '(license text not found in package)') +
                      '\n',
                  )
                  .join('\n')
              },
            },
          },
        }),
      ],
    },
  },
  worker: { format: 'es' },
  server: { headers: CORS_HEADERS, fs: { strict: false } },
  preview: { headers: CORS_HEADERS },
})
