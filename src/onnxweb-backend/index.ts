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

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(
    new URL('/simple-gain-stereo.onnx', window.location.origin).href,
    aniraJS.InferenceBackend.CUSTOM
  ),
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
// With JS callback, but passthrough implemented in Wasm
const onnxBackend = aniraJS.ONNXRuntimeWebBackend(inferenceConfig)

await aniraJS.registerProcessor(onnxBackend, 'ONNXRuntimeWebBackend')

const ppProcessor = aniraJS.PrePostProcessor(inferenceConfig)
ppProcessor.setInput(1, 0, 1) // Set gain tensor (tensor 1, channel 0) to 1.0

const hostAudioConfig = aniraJS.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraJS.InferenceHandler(
  ppProcessor,
  inferenceConfig,
  onnxBackend
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
sourceNode.connect(inferenceNode).connect(audioContext.destination)

// -------------------
// ------- UI --------
// -------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

gainSlider.oninput = () => {
  const val = parseFloat(gainSlider.value)
  gainValue.textContent = val.toFixed(2)
  ppProcessor.setInput(val, 0, 1)
}

removeLoadingIndicator()
console.log('Demo initialized and ready!')
