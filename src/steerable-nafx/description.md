# Steerable-NAFX (CNN)

This demo runs the Steerable-NAFX convolutional neural network model for guitar amp simulation. It uses a custom `JSPrePostProcessor` that reimplements the C++ `CNNPrePostProcessor` in JavaScript.

The CNN model requires a sliding window input: each inference receives `bufferSize` new audio samples prepended with `receptiveField` (13332) samples of past context. The custom `preProcess` override calls `popSamplesFromBufferWindow` to construct this overlapping window from the ring buffer on each audio callback.

**Model**: steerable-nafx-libtorch-dynamic.onnx | **Input**: [1, 1, 15380] | **Output**: [1, 1, 2048] | **Mono**, 44100 Hz
