// Parameter state + UI for the Scyclone full-chain demo.
//
// This module owns everything from the slider specs down to the rendered
// DOM. It receives the already-wired audio graph from index.ts as a
// `GraphRefs` object and only ever talks to the graph through it.

export type NetworkChain = {
  transient: AudioWorkletNode
  hp: BiquadFilterNode
  lp: BiquadFilterNode
  inference: AudioWorkletNode
  grainDryGain: GainNode
  grain: AudioWorkletNode
  grainWetGain: GainNode
  grainSum: GainNode
  onOff: GainNode
  output: GainNode
}

export type GraphRefs = {
  audioContext: AudioContext
  net1: NetworkChain
  net2: NetworkChain
  inputGain: GainNode
  outputGain: GainNode
  compressor: DynamicsCompressorNode
  compMakeup: GainNode
  fadeGain1: GainNode
  fadeGain2: GainNode
  compDryGain: GainNode
  compWetGain: GainNode
  masterDryGain: GainNode
  masterWetGain: GainNode
}

type SliderSpec = {
  label: string
  min: number
  max: number
  step: number
  default: number
  unit?: string
  onChange: (value: number) => void
}

export function setupControls(refs: GraphRefs, root: HTMLElement) {
  const {
    audioContext, net1, net2, inputGain, outputGain, compressor, compMakeup,
    fadeGain1, fadeGain2, compDryGain, compWetGain, masterDryGain, masterWetGain,
  } = refs

  // ---- Helpers -----------------------------------------------------------

  const dbToGain = (db: number) => Math.pow(10, db / 20)

  // Filter XY: 0..1, 0.5 = neutral. Below 0.5 enables LP (with cutoff sweeping
  // down), above 0.5 enables HP (with cutoff sweeping up). Matches Scyclone's
  // IIRCutoffFilter::updateFilterParams logic, just normalised to 0..1.
  function applyFilter(net: NetworkChain, value: number, time: number) {
    const v = Math.max(0, Math.min(1, value))
    if (v >= 0.5) {
      const t = (v - 0.5) / 0.5
      const freq = 20 * Math.pow(8000 / 20, t)
      net.hp.frequency.setTargetAtTime(freq, time, 0.01)
      net.lp.frequency.setTargetAtTime(20000, time, 0.01)
    } else {
      const t = v / 0.5
      const freq = 100 * Math.pow(20000 / 100, t)
      net.lp.frequency.setTargetAtTime(freq, time, 0.01)
      net.hp.frequency.setTargetAtTime(20, time, 0.01)
    }
  }

  // Transient shaper: -1..1 → (attack, sustain) gains, mirroring the original
  // 0..1 mapping but recentered to 0.
  function applyShaper(net: NetworkChain, value: number) {
    const v = Math.max(-1, Math.min(1, value))
    const norm = (v + 1) / 2
    let attack: number, sustain: number
    if (norm < 0.5) {
      attack = 1
      sustain = norm * 2
    } else {
      attack = 1 - (norm - 0.5) * 2
      sustain = 1
    }
    const t = audioContext.currentTime
    net.transient.parameters.get('attack')!.setValueAtTime(attack, t)
    net.transient.parameters.get('sustain')!.setValueAtTime(sustain, t)
  }

  function setGrainMix(net: NetworkChain, mix: number) {
    const t = audioContext.currentTime
    net.grainDryGain.gain.setTargetAtTime(1 - mix, t, 0.01)
    net.grainWetGain.gain.setTargetAtTime(mix, t, 0.01)
  }

  function setFade(value: number) {
    // 1 → only net1; 0 → only net2.
    const t = audioContext.currentTime
    fadeGain1.gain.setTargetAtTime(value, t, 0.01)
    fadeGain2.gain.setTargetAtTime(1 - value, t, 0.01)
  }

  function setCompMix(value: number) {
    const t = audioContext.currentTime
    compDryGain.gain.setTargetAtTime(1 - value, t, 0.01)
    compWetGain.gain.setTargetAtTime(value, t, 0.01)
  }

  function setMasterMix(value: number) {
    const t = audioContext.currentTime
    masterDryGain.gain.setTargetAtTime(1 - value, t, 0.01)
    masterWetGain.gain.setTargetAtTime(value, t, 0.01)
  }

  // ---- Initial state -----------------------------------------------------

  inputGain.gain.value = 1
  outputGain.gain.value = 1

  // Comp defaults from PluginParameters.cpp.
  compressor.threshold.value = -20
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.25
  compressor.knee.value = 6
  compMakeup.gain.value = dbToGain(-0.1)

  setCompMix(1.0)
  setMasterMix(0.7)
  setFade(1.0)

  for (const net of [net1, net2]) {
    net.onOff.gain.value = 1
    applyFilter(net, 0.5, audioContext.currentTime)
    applyShaper(net, 0)
    net.transient.parameters.get('attackTime')!.value = 0.5
    net.grain.parameters.get('interval')!.value = 80
    net.grain.parameters.get('grainSize')!.value = 60
    net.grain.parameters.get('delayPos')!.value = 120
    net.grain.parameters.get('pitch')!.value = 0
    setGrainMix(net, 0.25)
  }
  // Default: net2 (Djembe) starts off, like the plugin.
  net2.onOff.gain.value = 0

  // ---- Slider specs ------------------------------------------------------

  const sliderSpecs = (() => {
    const at = () => audioContext.currentTime
    return {
      // The three primary sliders mirror Scyclone's main view.
      fade: { label: 'Fade (Djembe ↔ Funk)', min: 0, max: 1, step: 0.01, default: 1,
        onChange: setFade },
      compMix: { label: 'Compression', min: 0, max: 1, step: 0.01, default: 1,
        onChange: setCompMix },
      masterMix: { label: 'Mix (Dry ↔ Wet)', min: 0, max: 1, step: 0.01, default: 0.7,
        onChange: setMasterMix },

      inputGain: { label: 'Input gain', unit: 'dB', min: -12, max: 12, step: 0.1, default: 0,
        onChange: (v: number) => inputGain.gain.setTargetAtTime(dbToGain(v), at(), 0.01) },
      outputGain: { label: 'Output gain', unit: 'dB', min: -12, max: 12, step: 0.1, default: 0,
        onChange: (v: number) => outputGain.gain.setTargetAtTime(dbToGain(v), at(), 0.01) },

      shape1: { label: 'Funk · Transient shape', min: -1, max: 1, step: 0.01, default: -0.4,
        onChange: (v: number) => applyShaper(net1, v) },
      filter1: { label: 'Funk · Filter (LP↔HP)', min: 0, max: 1, step: 0.001, default: 0.85,
        onChange: (v: number) => applyFilter(net1, v, at()) },
      shape2: { label: 'Djembe · Transient shape', min: -1, max: 1, step: 0.01, default: 0.4,
        onChange: (v: number) => applyShaper(net2, v) },
      filter2: { label: 'Djembe · Filter (LP↔HP)', min: 0, max: 1, step: 0.001, default: 0.15,
        onChange: (v: number) => applyFilter(net2, v, at()) },

      g1Pos: { label: 'Funk grain · Delay', unit: 'ms', min: 1, max: 1000, step: 1, default: 120,
        onChange: (v: number) => net1.grain.parameters.get('delayPos')!.setValueAtTime(v, at()) },
      g1Size: { label: 'Funk grain · Size', unit: 'ms', min: 10, max: 500, step: 1, default: 60,
        onChange: (v: number) => net1.grain.parameters.get('grainSize')!.setValueAtTime(v, at()) },
      g1Int: { label: 'Funk grain · Interval', unit: 'ms', min: 5, max: 1000, step: 1, default: 80,
        onChange: (v: number) => net1.grain.parameters.get('interval')!.setValueAtTime(v, at()) },
      g1Pitch: { label: 'Funk grain · Pitch', unit: 'st', min: -12, max: 12, step: 0.1, default: 0,
        onChange: (v: number) => net1.grain.parameters.get('pitch')!.setValueAtTime(v, at()) },
      g1Mix: { label: 'Funk grain · Mix', min: 0, max: 1, step: 0.01, default: 0.25,
        onChange: (v: number) => setGrainMix(net1, v) },
      g2Pos: { label: 'Djembe grain · Delay', unit: 'ms', min: 1, max: 1000, step: 1, default: 120,
        onChange: (v: number) => net2.grain.parameters.get('delayPos')!.setValueAtTime(v, at()) },
      g2Size: { label: 'Djembe grain · Size', unit: 'ms', min: 10, max: 500, step: 1, default: 60,
        onChange: (v: number) => net2.grain.parameters.get('grainSize')!.setValueAtTime(v, at()) },
      g2Int: { label: 'Djembe grain · Interval', unit: 'ms', min: 5, max: 1000, step: 1, default: 80,
        onChange: (v: number) => net2.grain.parameters.get('interval')!.setValueAtTime(v, at()) },
      g2Pitch: { label: 'Djembe grain · Pitch', unit: 'st', min: -12, max: 12, step: 0.1, default: 0,
        onChange: (v: number) => net2.grain.parameters.get('pitch')!.setValueAtTime(v, at()) },
      g2Mix: { label: 'Djembe grain · Mix', min: 0, max: 1, step: 0.01, default: 0.25,
        onChange: (v: number) => setGrainMix(net2, v) },

      tAttack1: { label: 'Funk · Transient attack time', unit: 's', min: 0.05, max: 2, step: 0.001, default: 0.5,
        onChange: (v: number) => net1.transient.parameters.get('attackTime')!.setValueAtTime(v, at()) },
      tAttack2: { label: 'Djembe · Transient attack time', unit: 's', min: 0.05, max: 2, step: 0.001, default: 0.5,
        onChange: (v: number) => net2.transient.parameters.get('attackTime')!.setValueAtTime(v, at()) },

      compThresh: { label: 'Comp · Threshold', unit: 'dB', min: -60, max: 0, step: 0.1, default: -20,
        onChange: (v: number) => compressor.threshold.setTargetAtTime(v, at(), 0.01) },
      compRatio: { label: 'Comp · Ratio', min: 1, max: 10, step: 0.1, default: 4,
        onChange: (v: number) => compressor.ratio.setTargetAtTime(v, at(), 0.01) },
      compMakeupParam: { label: 'Comp · Makeup', unit: 'dB', min: -0.1, max: 12, step: 0.1, default: -0.1,
        onChange: (v: number) => compMakeup.gain.setTargetAtTime(dbToGain(v), at(), 0.01) },
    } satisfies Record<string, SliderSpec>
  })()

  // ---- DOM helpers -------------------------------------------------------

  function fmt(value: number, step: number, unit?: string) {
    const txt = step >= 1 ? value.toFixed(0) : value.toFixed(2)
    return unit ? `${txt} ${unit}` : txt
  }

  function makeSlider(key: keyof typeof sliderSpecs): HTMLDivElement {
    const spec = sliderSpecs[key] as SliderSpec
    const wrap = document.createElement('div')
    wrap.className = 'slider-group'
    const label = document.createElement('label')
    label.className = 'slider-group__label'
    const valueSpan = document.createElement('span')
    valueSpan.className = 'slider-group__value'
    valueSpan.textContent = fmt(spec.default, spec.step, spec.unit)
    label.append(`${spec.label}: `, valueSpan)
    const input = document.createElement('input')
    input.className = 'slider'
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    input.value = String(spec.default)
    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      valueSpan.textContent = fmt(v, spec.step, spec.unit)
      spec.onChange(v)
    })
    wrap.append(label, input)
    return wrap
  }

  function makeSubsectionDivider(): HTMLElement {
    const d = document.createElement('div')
    d.className = 'controls-subsection-divider'
    return d
  }

  function makeNetworkToggle(label: string, defaultOn: boolean, onChange: (on: boolean) => void): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.className = 'slider-group'
    const lbl = document.createElement('label')
    lbl.className = 'slider-group__label'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = defaultOn
    cb.style.marginRight = '8px'
    cb.addEventListener('change', () => onChange(cb.checked))
    lbl.append(cb, label)
    wrap.append(lbl)
    return wrap
  }

  // ---- Render ------------------------------------------------------------

  // Primary section: three big controls + the two network on/offs.
  const primary = document.createElement('div')
  primary.style.display = 'grid'
  primary.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))'
  primary.style.gap = '16px 24px'
  primary.append(
    makeSlider('fade'),
    makeSlider('compMix'),
    makeSlider('masterMix'),
    makeNetworkToggle('Funk network', true, on =>
      net1.onOff.gain.setTargetAtTime(on ? 1 : 0, audioContext.currentTime, 0.005)),
    makeNetworkToggle('Djembe network', false, on =>
      net2.onOff.gain.setTargetAtTime(on ? 1 : 0, audioContext.currentTime, 0.005)),
  )
  root.append(primary)

  // Advanced section in a <details>.
  const details = document.createElement('details')
  details.style.marginTop = '20px'
  const summary = document.createElement('summary')
  summary.textContent = 'Advanced parameters'
  summary.style.cursor = 'pointer'
  summary.style.fontWeight = '600'
  summary.style.color = 'var(--color-text-muted)'
  summary.style.padding = '4px 0'
  details.append(summary)

  // Helpers for section structure -----------------------------------------

  function makeSectionHeader(text: string): HTMLElement {
    const h = document.createElement('div')
    h.textContent = text
    h.className = 'controls-section__header'
    return h
  }

  function makeColumnHeader(text: string, accent: string): HTMLElement {
    const h = document.createElement('div')
    h.textContent = text
    h.className = 'controls-column__header'
    h.style.borderBottomColor = accent
    return h
  }

  // Container: vertical stack of sections.
  const advancedRoot = document.createElement('div')
  advancedRoot.className = 'controls-advanced'
  advancedRoot.style.marginTop = '12px'

  // ---- Section 1: global (applies to both networks) ----------------------

  const globalSection = document.createElement('div')
  globalSection.className = 'controls-section'
  globalSection.append(makeSectionHeader('Global · applies to both networks'))

  const globalGrid = document.createElement('div')
  globalGrid.className = 'controls-grid'
  globalGrid.append(
    makeSlider('inputGain'),
    makeSlider('outputGain'),
    makeSlider('compThresh'),
    makeSlider('compRatio'),
    makeSlider('compMakeupParam'),
  )
  globalSection.append(globalGrid)
  advancedRoot.append(globalSection)

  // ---- Section 2: per-network (Funk | Djembe) ----------------------------

  const perNetSection = document.createElement('div')
  perNetSection.className = 'controls-section'
  perNetSection.append(makeSectionHeader('Per-network'))

  const perNetSplit = document.createElement('div')
  perNetSplit.className = 'controls-split'

  const funkCol = document.createElement('div')
  funkCol.className = 'controls-column controls-column--funk'
  funkCol.append(
    makeColumnHeader('Funk', '#EB1E79'),
    makeSlider('shape1'),
    makeSlider('filter1'),
    makeSlider('tAttack1'),
    makeSubsectionDivider(),
    makeSlider('g1Pos'),
    makeSlider('g1Size'),
    makeSlider('g1Int'),
    makeSlider('g1Pitch'),
    makeSlider('g1Mix'),
  )

  const djembeCol = document.createElement('div')
  djembeCol.className = 'controls-column controls-column--djembe'
  djembeCol.append(
    makeColumnHeader('Djembe', '#004E92'),
    makeSlider('shape2'),
    makeSlider('filter2'),
    makeSlider('tAttack2'),
    makeSubsectionDivider(),
    makeSlider('g2Pos'),
    makeSlider('g2Size'),
    makeSlider('g2Int'),
    makeSlider('g2Pitch'),
    makeSlider('g2Mix'),
  )

  perNetSplit.append(funkCol, djembeCol)
  perNetSection.append(perNetSplit)
  advancedRoot.append(perNetSection)

  details.append(advancedRoot)
  root.append(details)

  // Demo-local styling. Kept inline so it doesn't bleed into the shared
  // style.css used by the other demos.
  const styleEl = document.createElement('style')
  styleEl.textContent = `
    .controls-advanced {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .controls-section {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .controls-section__header {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted, #888);
      border-top: 1px solid var(--color-border, #2a2a2a);
      padding-top: 12px;
    }
    .controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px 24px;
    }
    .controls-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 32px;
    }
    .controls-split > .controls-column + .controls-column {
      border-left: 1px solid var(--color-border, #2a2a2a);
      padding-left: 32px;
      margin-left: -1px;
    }
    .controls-column {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .controls-column__header {
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      padding-bottom: 6px;
      border-bottom: 2px solid;
    }
    .controls-subsection-divider {
      height: 1px;
      background: var(--color-border, #2a2a2a);
      margin: 4px 0;
    }
    @media (max-width: 600px) {
      .controls-split { grid-template-columns: 1fr; }
      .controls-split > .controls-column + .controls-column {
        border-left: none;
        border-top: 1px solid var(--color-border, #2a2a2a);
        padding-left: 0;
        padding-top: 14px;
        margin-left: 0;
        margin-top: 6px;
      }
    }
  `
  document.head.append(styleEl)
}
