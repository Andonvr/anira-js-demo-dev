import { AniraJS } from 'anira-js'
import { setupDemoUI } from '../utils/setupDemoUI'

const aniraJS = await AniraJS.create()
await aniraJS.spinUpInferenceWorker()

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator } = await setupDemoUI(aniraJS, audio, audioContext)

// -------------------
// ------ WASM ------
// -------------------

const res = await fetch('streaming-gain-stereo.onnx')
if (!res.ok) {
  throw new Error('Failed to load model')
}
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(modelBuffer, aniraJS.InferenceBackend.ONNX),
])

const inputShapeList = aniraJS.TensorShapeList([
  [1, 2, 512],
  [1, 1, 512],
])
const outputShapeList = aniraJS.TensorShapeList([
  [1, 2, 512],
  [1, 1, 512],
])
const tensorShape = aniraJS.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraJS.VectorTensorShape([tensorShape])

const preprocessChannels = aniraJS.VectorSizeT([2, 1])
const postprocessChannels = aniraJS.VectorSizeT([2, 1])
const preprocessSize = aniraJS.VectorSizeT([512, 512])
const postprocessSize = aniraJS.VectorSizeT([512, 512])

const processingSpec = aniraJS.ProcessingSpec(
  preprocessChannels,
  postprocessChannels,
  preprocessSize,
  postprocessSize
)

const inferenceConfig = aniraJS.InferenceConfig(
  vectorModelData,
  vectorTensorShape,
  processingSpec,
  5,
  10,
  false,
  0,
  1
)

const ppProcessor = aniraJS.PrePostProcessor(inferenceConfig)

const hostAudioConfig = aniraJS.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraJS.InferenceHandler(ppProcessor, inferenceConfig)
inferenceHandler.setInferenceBackend(aniraJS.InferenceBackend.ONNX)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

await aniraJS.registerAudioWorkletForContext(
  audioContext,
  new URL('./audio-worklet.ts', import.meta.url)
)
const inferenceNode = await aniraJS.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor,
  'streaming-gain-stereo',
  { inputChannels: 3, outputChannels: 3 }
)

const sourceNode = audioContext.createMediaElementSource(audio)
sourceNode.connect(inferenceNode).connect(audioContext.destination)

// LFO: oscillates gain between 0 and 1 at 1 Hz
// OscillatorNode outputs [-1, 1], so shift+scale to [0, 1]
const lfo = audioContext.createOscillator()
lfo.frequency.value = 1
const lfoGain = audioContext.createGain()
lfoGain.gain.value = 0.75 // scale amplitude to 0.75
lfo.connect(lfoGain)
const gainParam = inferenceNode.parameters.get('gain')!
gainParam.value = 1.25 // DC offset: 1.25 ± 0.75 → [0.5, 2.0]
lfoGain.connect(gainParam)
lfo.start()

removeLoadingIndicator()
console.log('Demo initialized and ready!')
