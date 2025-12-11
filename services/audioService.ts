class AudioService {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  // Compressor removed to allow full, raw amplification
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private audioDataArray: Uint8Array | null = null;
  
  // Cache to store source nodes for audio elements to prevent "already connected" errors
  private elementSourceMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass();
    }
  }

  // Initialize the audio graph (Gain -> Analyser -> Destination)
  private setupAudioGraph() {
    if (!this.audioContext) return;

    // Only create nodes if they don't exist
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.analyser = this.audioContext.createAnalyser();

      // Configure Analyser
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.audioDataArray = new Uint8Array(bufferLength);

      // Direct Connection: Gain -> Analyser -> Destination
      // REMOVED: Compressor/Limiter. 
      // This allows the signal to exceed 0dBFS. The device's DAC/Speaker will clip the signal,
      // resulting in distortion but significantly higher perceived loudness (400% amplitude).
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }
  }

  async startFile(audioElement: HTMLAudioElement): Promise<void> {
    if (!this.audioContext) throw new Error("AudioContext not supported");

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.setupAudioGraph();

    // reuse existing source node if we've already created one for this element
    if (this.elementSourceMap.has(audioElement)) {
      this.sourceNode = this.elementSourceMap.get(audioElement)!;
    } else {
      this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
      this.elementSourceMap.set(audioElement, this.sourceNode);
    }

    // Connect source to gain node (re-connecting is safe)
    if (this.gainNode && this.sourceNode) {
        // Disconnect first to be safe, though not strictly required if topology is same
        try { this.sourceNode.disconnect(); } catch (e) {}
        this.sourceNode.connect(this.gainNode);
    }
  }

  stop() {
    // For file playback, we mainly rely on the element pausing.
    if (this.audioContext?.state === 'running') {
       // Optional: suspend context to save battery if needed
    }
  }

  setVolume(value: number) {
    if (this.gainNode && this.audioContext) {
      // Smooth transition to prevent clicking
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(value, this.audioContext.currentTime + 0.1);
    }
  }

  getAudioData(): Uint8Array {
    if (this.analyser && this.audioDataArray) {
      this.analyser.getByteFrequencyData(this.audioDataArray);
      return this.audioDataArray;
    }
    return new Uint8Array(0);
  }

  getContextState() {
    return this.audioContext?.state;
  }
}

export const audioService = new AudioService();