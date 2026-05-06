import sourceCode from './index.ts?raw'
import controlsSource from './controls.ts?raw'
import transientWorkletSource from './transient-splitter-worklet.ts?raw'
import grainWorkletSource from './grain-delay-worklet.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'controls.ts', code: controlsSource },
  { name: 'transient-splitter-worklet.ts', code: transientWorkletSource },
  { name: 'grain-delay-worklet.ts', code: grainWorkletSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
