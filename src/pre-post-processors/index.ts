import { AniraJS } from 'anira-js'
import { setupDemoUI } from '../utils/setupDemoUI'

const aniraJS = await AniraJS.create()
await aniraJS.spinUpInferenceWorker()

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(aniraJS, audio, audioContext)

// -------------------
// ------ WASM ------
// -------------------

const res = await fetch('simple-gain-stereo.onnx')
if (!res.ok) {
  throw new Error('Failed to load model')
}
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraJS.VectorModelData([
  aniraJS.ModelData(modelBuffer, aniraJS.InferenceBackend.ONNX),
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

// Create a JSPrePostProcessor on the main thread. The actual custom JS logic
// (GainPrePostProcessor subclass) lives in the audio worklet — that's where
// the pre/post callbacks fire during real-time processing.
const ppProcessor = aniraJS.JSPrePostProcessor(inferenceConfig)
ppProcessor.setInput(1, 0, 1) // Set gain tensor (tensor 1, channel 0) to 1.0

const hostAudioConfig = aniraJS.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraJS.InferenceHandler(ppProcessor, inferenceConfig)
inferenceHandler.setInferenceBackend(aniraJS.InferenceBackend.ONNX)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

// Register a custom audio worklet that sets up the JSPrePostProcessor
// subclass on the worklet thread, where pre/post processing actually runs.
await aniraJS.registerAudioWorkletForContext(
  audioContext,
  new URL('./audio-worklet.ts', import.meta.url)
)
const inferenceNode = await aniraJS.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor,
  'pre-post-processors'
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

// -------------------
// ------- UI --------
// -------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

// The slider sets the raw gain on the main thread via setInput.
// On the worklet thread, GainPrePostProcessor.preProcess() reads this
// value and squares it before passing it to the C++ pre-processing,
// giving the slider an exponential curve feel.
gainSlider.oninput = () => {
  const val = parseFloat(gainSlider.value)
  gainValue.textContent = val.toFixed(2)
  ppProcessor.setInput(val, 0, 1)
}

removeLoadingIndicator()
console.log('Demo initialized and ready!')
