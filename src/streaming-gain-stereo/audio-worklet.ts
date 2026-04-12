import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from 'anira-js/workers/worklet-base'

const AUDIO_CHANNELS = 2
const NUM_TENSORS = 2

class StreamingGainStereo extends AniraAudioWorkletBase {
  private currentGainParam: Float32Array | null = null

  // Multi-tensor pointer structure for processMulti (allocated once in onConfigured)
  private inputTensorPtrs = 0
  private outputTensorPtrs = 0
  private inputNumSamples = 0
  private outputNumSamples = 0

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 1.0, minValue: 0.0, maxValue: 2.0 }]
  }

  protected async onConfigured(state: AniraWorkletState) {
    const malloc = state.aniraJS.malloc.bind(state.aniraJS)
    const heapU32 = state.aniraJS.getHeapU32()
    const { inputDataBuffer, outputDataBuffer, ioConfig } = state
    const bpc = ioConfig.maxBufferSize * Float32Array.BYTES_PER_ELEMENT

    // Build the float*** structure that processMulti expects:
    //   inputTensorPtrs[tensor_index] → channel pointer array
    //   channel pointer array[channel] → sample data buffer

    // Input tensor 0 (audio): 2 channels
    const audioInChPtrs = malloc(AUDIO_CHANNELS * 4)
    for (let ch = 0; ch < AUDIO_CHANNELS; ch++) {
      heapU32[audioInChPtrs / 4 + ch] = inputDataBuffer + ch * bpc
    }

    // Input tensor 1 (gain): 1 channel
    const gainInChPtrs = malloc(1 * 4)
    heapU32[gainInChPtrs / 4] = inputDataBuffer + AUDIO_CHANNELS * bpc

    // Top-level input: float*** → [audioInChPtrs, gainInChPtrs]
    this.inputTensorPtrs = malloc(NUM_TENSORS * 4)
    heapU32[this.inputTensorPtrs / 4] = audioInChPtrs
    heapU32[this.inputTensorPtrs / 4 + 1] = gainInChPtrs

    // Output tensor 0 (audio): 2 channels
    const audioOutChPtrs = malloc(AUDIO_CHANNELS * 4)
    for (let ch = 0; ch < AUDIO_CHANNELS; ch++) {
      heapU32[audioOutChPtrs / 4 + ch] = outputDataBuffer + ch * bpc
    }

    // Output tensor 1 (gain passthrough): 1 channel
    const gainOutChPtrs = malloc(1 * 4)
    heapU32[gainOutChPtrs / 4] = outputDataBuffer + AUDIO_CHANNELS * bpc

    // TODO: wth?
    // Top-level output: float*** → [audioOutChPtrs, gainOutChPtrs]
    this.outputTensorPtrs = malloc(NUM_TENSORS * 4)
    heapU32[this.outputTensorPtrs / 4] = audioOutChPtrs
    heapU32[this.outputTensorPtrs / 4 + 1] = gainOutChPtrs

    // Num samples arrays (one entry per tensor, filled per-block)
    this.inputNumSamples = malloc(NUM_TENSORS * 4)
    this.outputNumSamples = malloc(NUM_TENSORS * 4)
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    this.currentGainParam = parameters.gain ?? null
    return super.process(inputs, outputs, parameters)
  }

  protected processAudioBlock(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    state: AniraWorkletState,
    bufferSize: number
  ): void {
    const heapU32 = state.aniraJS.getHeapU32()
    const { inferenceHandler, ioConfig, inputChannelViews, outputChannelViews } = state

    const inputNode = inputs[ioConfig.inputNodeIndex]
    const outputNode = outputs[ioConfig.outputNodeIndex]

    // Zero outputs
    if (outputNode?.length > 0) {
      for (let ch = 0; ch < outputNode.length; ch++) outputNode[ch].fill(0)
    }

    // Copy audio input channels (channels 0–1)
    if (inputNode?.length > 0) {
      const count = Math.min(inputNode.length, AUDIO_CHANNELS)
      for (let ch = 0; ch < count; ch++) inputChannelViews[ch].set(inputNode[ch], 0)
      for (let ch = count; ch < AUDIO_CHANNELS; ch++)
        inputChannelViews[ch].fill(0, 0, bufferSize)
    } else {
      for (let ch = 0; ch < AUDIO_CHANNELS; ch++)
        inputChannelViews[ch].fill(0, 0, bufferSize)
    }

    // Fill gain channel (channel 2) from AudioParam
    const gainParam = this.currentGainParam
    const gainView = inputChannelViews[AUDIO_CHANNELS]
    if (gainParam) {
      if (gainParam.length === 1) {
        gainView.fill(gainParam[0], 0, bufferSize)
      } else {
        gainView.set(gainParam.subarray(0, bufferSize), 0)
      }
    } else {
      gainView.fill(1.0, 0, bufferSize)
    }

    // Set per-tensor sample counts
    heapU32[this.inputNumSamples / 4] = bufferSize
    heapU32[this.inputNumSamples / 4 + 1] = bufferSize
    heapU32[this.outputNumSamples / 4] = bufferSize
    heapU32[this.outputNumSamples / 4 + 1] = bufferSize

    // processMulti handles all tensors (audio + gain) in one call
    const resultPtr = inferenceHandler.processMulti(
      this.inputTensorPtrs,
      this.inputNumSamples,
      this.outputTensorPtrs,
      this.outputNumSamples
    )

    // resultPtr is a size_t* with samples received per tensor
    const samplesProcessed = heapU32[resultPtr / 4]

    // Copy only the audio output channels (skip gain passthrough on channel 2)
    if (outputNode?.length > 0 && samplesProcessed > 0) {
      const count = Math.min(outputNode.length, AUDIO_CHANNELS)
      for (let ch = 0; ch < count; ch++) {
        const src = outputChannelViews[ch]
        const dst = outputNode[ch]
        const n = Math.min(samplesProcessed, dst.length, ioConfig.maxBufferSize)
        for (let i = 0; i < n; i++) dst[i] = src[i]
      }
    }
  }
}

registerProcessor('streaming-gain-stereo', StreamingGainStereo)
