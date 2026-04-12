import type { AniraJS } from 'anira-js'

/**
 * Wires up the demo UI controls that already exist in the HTML.
 * Enables buttons and attaches event handlers for audio playback and worker management.
 */
export const setupDemoUI = async (
  aniraJS: AniraJS,
  audio?: HTMLAudioElement,
  audioContext?: AudioContext,
  customInferenceWorkerUrl?: URL
) => {
  const audioToggleButton = document.getElementById('audio-toggle') as HTMLButtonElement
  audioToggleButton.disabled = false

  const workerCountElement = document.getElementById('worker-count')!
  const addWorkerButton = document.getElementById('add-worker') as HTMLButtonElement
  const removeWorkerButton = document.getElementById('remove-worker') as HTMLButtonElement

  addWorkerButton.disabled = false

  const updateWorkerCount = () => {
    workerCountElement.textContent = aniraJS.getActiveWorkers().length.toString()
    removeWorkerButton.disabled = aniraJS.getActiveWorkers().length === 0
  }

  if (audio) {
    audioToggleButton.onclick = async () => {
      if (audio.paused) {
        try {
          if (audioContext && audioContext.state !== 'running') {
            await audioContext.resume()
          }
          await audio.play()
        } catch (error) {
          console.error('Failed to start audio playback:', error)
          return
        }
        audioToggleButton.textContent = 'Pause'
      } else {
        audio.pause()
        audioToggleButton.textContent = 'Play'
      }
    }
  }

  addWorkerButton.onclick = async () => {
    try {
      await aniraJS.spinUpInferenceWorker(customInferenceWorkerUrl)
      updateWorkerCount()
      console.log('Added inference worker. Total:', aniraJS.getActiveWorkers().length)
    } catch (error) {
      console.error('Failed to add worker:', error)
    }
  }

  removeWorkerButton.onclick = async () => {
    const workers = aniraJS.getActiveWorkers()
    if (workers.length === 0) {
      console.warn('No workers to remove')
      return
    }

    await workers[0].stop()
    updateWorkerCount()
    console.log('Removed inference worker. Remaining:', aniraJS.getActiveWorkers().length)
  }

  updateWorkerCount()
  return {
    removeLoadingIndicator: () => document.getElementById('loading-indicator')?.remove(),
  }
}
