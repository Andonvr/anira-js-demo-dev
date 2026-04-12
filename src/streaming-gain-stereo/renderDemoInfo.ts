import indexSource from './index.ts?raw'
import audioWorkletSource from './audio-worklet.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: indexSource },
  { name: 'audio-worklet.ts', code: audioWorkletSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])
