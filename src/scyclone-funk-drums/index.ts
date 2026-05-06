import { AniraWeb } from 'anira-web'
import { setupDemoUI } from '../utils/setupDemoUI'
import { setupControls, type NetworkChain } from './controls'
import transientWorkletUrl from './transient-splitter-worklet.ts?worker&url'
import grainWorkletUrl from './grain-delay-worklet.ts?worker&url'

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------

const aniraWeb = await AniraWeb.create()
// Two inference workers so the two RAVE models can run in parallel.
await aniraWeb.spinUpInferenceWorker()
await aniraWeb.spinUpInferenceWorker()

const audio = new Audio('drumloop.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator } = await setupDemoUI(aniraWeb, audio, audioContext)

// -------------------------------------------------------------------------
// Inference setup (one InferenceHandler per RAVE model)
// -------------------------------------------------------------------------

// Both RAVE models are designed for 16384-sample blocks at 48 kHz.
const BUFFER_SIZE = 16384
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

async function buildInferenceNode(modelPath: string) {
  const res = await fetch(modelPath)
  if (!res.ok) throw new Error(`Failed to load model ${modelPath}`)
  const modelBuffer = await res.arrayBuffer()

  const vectorModelData = aniraWeb.VectorModelData([
    aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
  ])

  const inputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
  const outputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
  const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
  const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

  const preprocessChannels = aniraWeb.VectorSizeT([1])
  const postprocessChannels = aniraWeb.VectorSizeT([1])
  const preprocessSize = aniraWeb.VectorSizeT([BUFFER_SIZE])
  const postprocessSize = aniraWeb.VectorSizeT([BUFFER_SIZE])

  const processingSpec = aniraWeb.ProcessingSpec(
    preprocessChannels,
    postprocessChannels,
    preprocessSize,
    postprocessSize
  )

  const inferenceConfig = aniraWeb.InferenceConfig(
    vectorModelData,
    vectorTensorShape,
    processingSpec,
    REALTIME_THRESHOLD_MS,
    2,
    false,
    0,
    1
  )

  const ppProcessor = aniraWeb.PrePostProcessor(inferenceConfig)
  const hostAudioConfig = aniraWeb.HostConfig(128, audioContext.sampleRate, false, 0)
  const inferenceHandler = aniraWeb.InferenceHandler(ppProcessor, inferenceConfig)
  inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.ONNX)
  inferenceHandler.prepare(hostAudioConfig)

  const node = await aniraWeb.configureAudioWorklet(
    audioContext,
    inferenceHandler,
    ppProcessor,
    undefined,
    { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
  )

  return { node, latencySamples: inferenceHandler.getLatency() }
}

// Register all worklet modules before instantiating any nodes.
await aniraWeb.registerAudioWorkletForContext(audioContext)
await audioContext.audioWorklet.addModule(transientWorkletUrl)
await audioContext.audioWorklet.addModule(grainWorkletUrl)

const { node: inferenceNode1, latencySamples: latency1 } = await buildInferenceNode('funk_drums.onnx')
const { node: inferenceNode2, latencySamples: latency2 } = await buildInferenceNode('djembe.onnx')

// -------------------------------------------------------------------------
// Audio graph
// -------------------------------------------------------------------------
//
//   source ─┬─► dryDelay ──────────────────────► masterDryGain ─┐
//           │                                                    ├─► dest
//           └─► toMono → inputGain ─┬─► [net1 chain] ─┐          │
//                                   └─► [net2 chain] ─┴► fade ─► comp(dry/wet) ─► outputGain ─► masterWetGain ─┘
//
// Per-network chain:
//   transient → HP → LP → inference → (grainDry + grainDelay → grainWet) → onOff
//
// All nodes between toMono and outputGain are mono.

const sourceNode = audioContext.createMediaElementSource(audio)

// Master dry/wet: delay the dry path so it lines up with the model latency.
// Mirrors PluginProcessor.cpp's setWetLatency(onnxProcessor.getLatency()).
const dryLatencySamples = Math.max(latency1, latency2)
const dryDelay = audioContext.createDelay(2)
dryDelay.delayTime.value = dryLatencySamples / audioContext.sampleRate

const masterDryGain = audioContext.createGain()
const masterWetGain = audioContext.createGain()

// stereo → mono via downmix
const toMono = audioContext.createGain()
toMono.channelCount = 1
toMono.channelCountMode = 'explicit'
toMono.channelInterpretation = 'speakers'

const inputGain = audioContext.createGain()

function makeNetworkChain(inference: AudioWorkletNode): NetworkChain {
  const monoOpts = {
    channelCount: 1,
    channelCountMode: 'explicit' as const,
    channelInterpretation: 'speakers' as const,
  }

  const transient = new AudioWorkletNode(audioContext, 'transient-splitter', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    ...monoOpts,
  })

  const hp = audioContext.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 20
  hp.Q.value = 0.5

  const lp = audioContext.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 20000
  lp.Q.value = 0.5

  const grain = new AudioWorkletNode(audioContext, 'grain-delay', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    ...monoOpts,
  })

  const grainDryGain = audioContext.createGain()
  const grainWetGain = audioContext.createGain()
  const grainSum = audioContext.createGain()
  const onOff = audioContext.createGain()
  const output = audioContext.createGain()

  transient.connect(hp).connect(lp).connect(inference)
  inference.connect(grainDryGain).connect(grainSum)
  inference.connect(grain).connect(grainWetGain).connect(grainSum)
  grainSum.connect(onOff).connect(output)

  return { transient, hp, lp, inference, grainDryGain, grain, grainWetGain, grainSum, onOff, output }
}

const net1 = makeNetworkChain(inferenceNode1)
const net2 = makeNetworkChain(inferenceNode2)

// Fade crossfade: fade=1 → net1 only; fade=0 → net2 only.
const fadeGain1 = audioContext.createGain()
const fadeGain2 = audioContext.createGain()
const fadeSum = audioContext.createGain()
net1.output.connect(fadeGain1).connect(fadeSum)
net2.output.connect(fadeGain2).connect(fadeSum)

// Compressor with dry/wet around it.
const compressor = audioContext.createDynamicsCompressor()
const compDryGain = audioContext.createGain()
const compWetGain = audioContext.createGain()
const compSum = audioContext.createGain()
const compMakeup = audioContext.createGain()
fadeSum.connect(compDryGain).connect(compSum)
fadeSum.connect(compressor).connect(compMakeup).connect(compWetGain).connect(compSum)

const outputGain = audioContext.createGain()
compSum.connect(outputGain)

// Input split
sourceNode.connect(toMono).connect(inputGain)
inputGain.connect(net1.transient)
inputGain.connect(net2.transient)

// Master dry/wet
sourceNode.connect(dryDelay).connect(masterDryGain).connect(audioContext.destination)
outputGain.connect(masterWetGain).connect(audioContext.destination)

// -------------------------------------------------------------------------
// Parameter state + UI (see controls.ts)
// -------------------------------------------------------------------------

setupControls(
  {
    audioContext,
    net1, net2,
    inputGain, outputGain,
    compressor, compMakeup,
    fadeGain1, fadeGain2,
    compDryGain, compWetGain,
    masterDryGain, masterWetGain,
  },
  document.getElementById('controls')!,
)

removeLoadingIndicator()
console.log('Scyclone full chain initialised.')
