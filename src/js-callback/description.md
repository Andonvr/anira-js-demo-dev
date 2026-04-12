# JS Callback Demo

This demo shows how to use a **custom JavaScript callback** as the inference backend in Anira JS.

Instead of relying on a pre-built ONNX or WASM backend, you provide your own processing function that gets called for each audio block. This is useful for:

- Prototyping new audio effects without compiling a model
- Wrapping existing JavaScript DSP code
- Testing the worker pipeline with a simple passthrough or gain function
