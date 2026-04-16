import { AniraJS } from 'anira-js'
import { setupDemoUI } from '../utils/setupDemoUI'

const aniraJS = await AniraJS.create()
await aniraJS.spinUpInferenceWorker()

const audio = new Audio('guitar.mp3')
const audioContext = new AudioContext({ sampleRate: 44100 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(
  aniraJS,
  audio,
  audioContext
)

// -------------------
// ------ WASM ------
// -------------------

const BUFFER_SIZE = 1024
const CNN_RECEPTIVE_FIELD = 132
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

const res = await fetch('steerable-nafx-2_blocks-libtorch-dynamic.onnx')
if (!res.ok) throw new Error('Failed to load model')
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(modelBuffer, aniraJS.InferenceBackend.ONNX),
])

// Input: [1, 1, bufferSize + receptiveField], Output: [1, 1, bufferSize]
const inputShapeList = aniraJS.TensorShapeList([
  [1, 1, BUFFER_SIZE + CNN_RECEPTIVE_FIELD],
])
const outputShapeList = aniraJS.TensorShapeList([[1, 1, BUFFER_SIZE]])
const tensorShape = aniraJS.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraJS.VectorTensorShape([tensorShape])

// Mono: 1 channel, bufferSize samples
const preprocessChannels = aniraJS.VectorSizeT([1])
const postprocessChannels = aniraJS.VectorSizeT([1])
const preprocessSize = aniraJS.VectorSizeT([BUFFER_SIZE])
const postprocessSize = aniraJS.VectorSizeT([BUFFER_SIZE])

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
  REALTIME_THRESHOLD_MS, // max inference time in ms (realtime threshold)
  2, // warm-up iterations
  false, // session exclusive processor
  0, // blocking ratio
  1 // num parallel processors
)

// Use JSPrePostProcessor so the custom CNN windowing logic runs in JS
const ppProcessor = aniraJS.JSPrePostProcessor(inferenceConfig)

const hostAudioConfig = aniraJS.HostConfig(128, 44100, false, 0)
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
  'steerable-nafx',
  { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('Steerable-NAFX demo initialized!')
