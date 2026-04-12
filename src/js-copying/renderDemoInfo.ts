import sourceCode from './index.ts?raw'
import workerSource from './customInferenceWorker.ts?raw'
import jsCopyBackendSource from '../misc/JSCopyBackend.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'customInferenceWorker.ts', code: workerSource },
  { name: 'JSCopyBackend.ts', code: jsCopyBackendSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])
