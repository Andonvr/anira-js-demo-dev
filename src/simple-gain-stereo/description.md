# Simple Gain

This demo shows how to load and use a simple audio effect model using AniraJS. The inference is run using the default ONNX backend. This is the simplest possible way to run actual inference. No JS-callbacks are used, as the WebAssembly build of ONNX Runtime is used directly, instead of Onnx Runtime Web.
The model used in this demo simulates a simple stereo gain effect. The value of the gain can be changed using the slider in the UI. Note that this value is not applied per sample, but rather per inference (multiple samples at a time). For a more complex example, where control values are applied per sample, see the [Streaming Gain Demo](/streaming-gain-stereo.html).

TODO: More text