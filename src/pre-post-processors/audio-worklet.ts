import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from 'anira-js/workers/worklet-base'

/**
 * Custom audio worklet that sets up a JSPrePostProcessor with overridden
 * pre/post processing methods on the worklet thread.
 *
 * Pre/post processing runs on the audio worklet thread (not the main thread),
 * because it's part of the real-time audio path:
 *   Audio thread → Context.pre_process() → C++ JSPrePostProcessor → JS callback → here
 *
 * We can't import JSPrePostProcessor directly from 'anira-js' in a worklet
 * (the main entry pulls in factory.ts which uses module-level URL construction).
 * Instead, we use the worklet's AniraJS instance to reconstruct it from its pointer.
 */
class PrePostProcessorWorklet extends AniraAudioWorkletBase {
  protected async onConfigured(state: AniraWorkletState) {
    const { aniraJS, prePostProcessorPtr } = state

    // Reconstruct the JSPrePostProcessor on the worklet thread using the
    // factory that's already available on the worklet's AniraJS instance.
    const ppProcessor = aniraJS.JSPrePostProcessor.fromPointer(prePostProcessorPtr)

    // Override preProcess to clamp the gain to [0, 1].
    // Clamping is idempotent — if the worklet re-reads its own modified value
    // before the main thread writes the next one, clamping again is a no-op.
    // You can hear this working: moving the slider above 1.0 has no effect.
    const defaultPreProcess = ppProcessor.preProcess.bind(ppProcessor)
    ppProcessor.preProcess = (
      ringBuffers: number,
      buffers: number,
      backend: number
    ) => {
      const gain = ppProcessor.getInput(0, 1)
      ppProcessor.setInput(Math.min(1.0, gain), 0, 1)
      defaultPreProcess(ringBuffers, buffers, backend)
    }

    // Register in the worklet's own AniraJS registry — this is where
    // the processPrePost callback dispatches to.
    aniraJS.registerPrePostProcessor(ppProcessor)
  }
}

registerProcessor('pre-post-processors', PrePostProcessorWorklet)
