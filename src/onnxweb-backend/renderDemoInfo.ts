import sourceCode from './index.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'setupDemoUI.ts', code: demoUISource },
])
