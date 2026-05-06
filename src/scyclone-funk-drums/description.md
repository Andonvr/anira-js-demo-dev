# Scyclone (full chain)

A web port of the full [Scyclone](https://github.com/Torsion-Audio/Scyclone)
neural audio plugin. Scyclone re-synthesises incoming audio in the timbre of
a corpus the model was trained on; the original plugin runs **two** RAVE
models in parallel (`funk_drums` and `djembe`) and surrounds each with a
small chain of conventional DSP. This demo reproduces that whole chain in
the browser.

## Signal flow

```
source ─┬─► dryDelay (≈341 ms latency match) ───► masterDryGain ─┐
        │                                                         ├─► dest
        └─► toMono → inputGain ─┬─► [Funk]   ─┐                    │
                                └─► [Djembe] ─┴─► fade ─► comp(dry/wet) ─► outputGain ─► masterWetGain ─┘

[net] = transient splitter → HP → LP → RAVE inference → (post-RAVE dry + grain delay) → on/off
```

## How the DSP maps to Web Audio

| Block | Implementation |
|---|---|
| RAVE inference (×2) | Two `AniraWeb.configureAudioWorklet` nodes, each running a `[1, 1, 16384]` ONNX model on its own inference worker |
| HP + LP filter | Two `BiquadFilterNode`s per network, driven by a single 0–1 XY knob (Scyclone's filter mapping) |
| Dynamics compressor | `DynamicsCompressorNode` with explicit dry/wet gains and a separate makeup `GainNode` |
| Transient splitter | Pure-JS `AudioWorkletProcessor` — three envelope followers compute an attack/sustain ratio per sample, port of Scyclone's `TransientSplitter.cpp` |
| Granular delay | Pure-JS `AudioWorkletProcessor` — circular delay buffer + 24-voice grain pool with Hann windowing and linear-interpolation reads. Replaces Scyclone's RNBO patcher |
| On/off, fade crossfade, comp dry/wet, master dry/wet | Plain `GainNode`s |
| Master latency match | `DelayNode` of 16384 / 48000 ≈ 341 ms on the dry path |
| Stereo → mono downmix | `GainNode` with `channelCount=1`, `channelInterpretation='speakers'` |

The transient splitter and grain delay both run as **plain JavaScript**
worklets — no WASM. The grain delay's 4 parameters (delay position, grain
size, interval, pitch) are exposed as `AudioParam`s and read each render
quantum.

## UI

Three primary controls mirror Scyclone's main view: **Fade** (Funk ↔
Djembe), **Compression** (comp dry/wet) and **Mix** (master dry/wet), plus
on/off checkboxes for each network. Everything else (input/output gain,
transient shape & filter & attack time per network, all 8 grain delay
knobs, comp threshold/ratio/makeup) lives behind an **Advanced
parameters** disclosure, laid out as a Funk column and a Djembe column
either side of a divider, with the global parameters above.

## Caveats

- **CPU**: two RAVE models at 16384/48 kHz is heavy. Underpowered machines
  will glitch.
- **Sample rate**: Scyclone's models are trained at **48 kHz**. The
  `AudioContext` and the anira `HostConfig` are both pinned to 48000;
  running at 44.1 kHz produces aliased, screeching output.
- **Djembe network starts off** by default, matching the plugin. Tick its
  checkbox and pull the Fade slider below 1 to mix it in.
