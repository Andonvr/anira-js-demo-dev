import { AniraJS } from 'anira-js'
import { setupDemoUI } from '../utils/setupDemoUI'

const aniraJS = await AniraJS.create()
await aniraJS.spinUpInferenceWorker()

const audio = new Audio('guitar.mp3')
const audioContext = new AudioContext({ sampleRate: 44100 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(aniraJS, audio, audioContext)

// -------------------
// ------ WASM ------
// -------------------

const BUFFER_SIZE = 2048
const CONTEXT_SAMPLES = 150
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

const res = await fetch('GuitarLSTM-libtorch-dynamic.onnx')
if (!res.ok) throw new Error('Failed to load model')
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(modelBuffer, aniraJS.InferenceBackend.ONNX),
])

// Input: [bufferSize, 1, contextSamples], Output: [bufferSize, 1]
const inputShapeList = aniraJS.TensorShapeList([[BUFFER_SIZE, 1, CONTEXT_SAMPLES]])
const outputShapeList = aniraJS.TensorShapeList([[BUFFER_SIZE, 1]])
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
  2, // warm-up iterations (reduced for browser latency)
  false,
  0,
  1 // num parallel processors
)

// Use JSPrePostProcessor so the custom HybridNN batched windowing runs in JS
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
  'guitar-lstm',
  { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('GuitarLSTM demo initialized!')
