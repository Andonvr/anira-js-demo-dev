import { AniraJS } from 'anira-js'
import { JSCopyBackend } from '../misc/JSCopyBackend'
import { setupDemoUI } from '../utils/setupDemoUI'

const customInferenceWorkerUrl = new URL('./customInferenceWorker.ts', import.meta.url)

const aniraJS = await AniraJS.create()
await aniraJS.spinUpInferenceWorker(customInferenceWorkerUrl)

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(aniraJS, audio, audioContext, customInferenceWorkerUrl)

// -------------------
// ------ WASM ------
// -------------------

const res = await fetch('simple-gain-stereo.onnx')
if (!res.ok) {
  throw new Error('Failed to load model')
}
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(modelBuffer, aniraJS.InferenceBackend.CUSTOM),
])

const inputShapeList = aniraJS.TensorShapeList([[1, 2, 512], [1]])
const outputShapeList = aniraJS.TensorShapeList([[1, 2, 512], [1]])
const tensorShape = aniraJS.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraJS.VectorTensorShape([tensorShape])

const preprocessChannels = aniraJS.VectorSizeT([2, 1])
const postprocessChannels = aniraJS.VectorSizeT([2, 1])
const preprocessSize = aniraJS.VectorSizeT([512, 0])
const postprocessSize = aniraJS.VectorSizeT([512, 0])

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

const jsCopyBackend = new JSCopyBackend(aniraJS.getWasmInstance(), inferenceConfig)
await aniraJS.registerProcessor(jsCopyBackend, 'JSCopyBackend')

const ppProcessor = aniraJS.PrePostProcessor(inferenceConfig)
ppProcessor.setInput(1, 0, 1) // Set gain tensor (tensor 1, channel 0) to 1.0

const hostAudioConfig = aniraJS.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraJS.InferenceHandler(
  ppProcessor,
  inferenceConfig,
  jsCopyBackend
)
inferenceHandler.setInferenceBackend(aniraJS.InferenceBackend.CUSTOM)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

await aniraJS.registerAudioWorkletForContext(audioContext)
const inferenceNode = await aniraJS.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('Demo initialized and ready!')
