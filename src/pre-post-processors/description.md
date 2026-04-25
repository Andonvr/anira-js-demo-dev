# PrePostProcessors

This demo shows how to use a `JSPrePostProcessor` for custom JavaScript-based pre/post processing in the inference pipeline.

Unlike the regular `PrePostProcessor` (which runs entirely in C++/WASM), `JSPrePostProcessor` routes the pre- and post-processing phases through JavaScript callbacks, allowing you to run custom JS logic as part of the real-time audio path.

**How it works:** Pre/post processing runs on the **audio worklet thread** (not the main thread). The C++ inference pipeline calls `Context::pre_process()` and `Context::post_process()` synchronously from the audio thread, which triggers a JS callback into the worklet's `AniraWeb` instance. This means:

- The `JSPrePostProcessor` must be reconstructed and registered on the **worklet thread** (in `onConfigured()`)
- The main thread creates the base `JSPrePostProcessor` and passes its pointer to the worklet
- `setInput()` writes to shared WASM memory (atomics), so values set from the main thread are visible on the worklet thread

In this demo, `preProcess` is overridden to clamp the gain to a maximum of 1.0. You can verify the JS callback is working: moving the slider above 1.0 has no effect on the audio volume.

**Important:** Any transformation applied via `setInput` in the override must be **idempotent** — the worklet may re-read its own modified value before the main thread writes the next one. Clamping satisfies this: clamping an already-clamped value is a no-op.
