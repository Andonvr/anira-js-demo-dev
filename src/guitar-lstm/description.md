# GuitarLSTM (HybridNN)

This demo runs the GuitarLSTM hybrid neural network model for guitar amp simulation. It uses a custom `JSPrePostProcessor` that reimplements the C++ `HybridNNPrePostProcessor` in JavaScript.

The LSTM model uses a batched input format: each batch element is a context window of 150 samples (149 past + 1 new). The custom `preProcess` override loops over all batch elements, calling `popSamplesFromBufferWindowOffset` for each to construct the context windows at the correct offsets in the output tensor.

**Model**: GuitarLSTM-libtorch-dynamic.onnx | **Input**: [256, 1, 150] | **Output**: [256, 1] | **Mono**, 44100 Hz
