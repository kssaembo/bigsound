import workletUrl from './limiter.worklet.js?worker&url';
export interface Meter { reductionDb: number; peak: number }
export type EngineMode = 'ready' | 'limiter' | 'fallback';
export const clampVolume = (value: number) => Number.isFinite(value) ? Math.min(4, Math.max(0, value)) : 1;

class AudioService {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private setup: Promise<void> | null = null;
  private desiredVolume = 1;
  private compressor: DynamicsCompressorNode | null = null;
  mode: EngineMode = 'ready';
  meter: Meter = { reductionDb: 0, peak: 0 };

  // Called synchronously from a user gesture, before awaiting play().
  async prepare(element: HTMLAudioElement) {
    if (!this.context) this.context = new AudioContext();
    const resume = this.context.resume();
    if (!this.setup) this.setup = this.createGraph(element).catch(error => { this.setup = null; throw error; });
    await Promise.all([resume, this.setup]);
    this.setVolume(this.desiredVolume);
  }

  private async createGraph(element: HTMLAudioElement) {
    const ctx = this.context!;
    this.gain ??= ctx.createGain();
    this.gain.gain.value = this.desiredVolume;
    let protector: AudioNode;
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const limiter = new AudioWorkletNode(ctx, 'super-volume-limiter', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
      });
      limiter.port.onmessage = (event: MessageEvent<Meter>) => { this.meter = event.data; };
      protector = limiter;
      this.mode = 'limiter';
    } catch (error) {
      console.warn('AudioWorklet unavailable, using compressor and sample clamp.', error);
      // Graceful fallback: compressor reduces sustained overload; waveshaper catches overshoots.
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -3;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.08;
      this.compressor = compressor;
      const guard = ctx.createWaveShaper();
      const ceiling = Math.pow(10, -1 / 20);
      // Identity within the ceiling; clamp outside. Fallback can distort on transients.
      guard.curve = Float32Array.from({ length: 8193 }, (_, i) => Math.max(-ceiling, Math.min(ceiling, i / 4096 - 1)));
      compressor.connect(guard);
      guard.connect(ctx.destination);
      protector = compressor;
      this.mode = 'fallback';
    }
    this.source ??= ctx.createMediaElementSource(element);
    this.source.connect(this.gain);
    this.gain.connect(protector);
    if (this.mode === 'limiter') protector.connect(ctx.destination);
  }

  setVolume(value: number) {
    this.desiredVolume = clampVolume(value);
    if (!this.gain || !this.context) return;
    const param = this.gain.gain;
    const now = this.context.currentTime;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    param.linearRampToValueAtTime(this.desiredVolume, now + 0.04);
  }

  getMeter(): Meter {
    if (this.compressor) return { reductionDb: -this.compressor.reduction, peak: 0 };
    return this.meter;
  }
}
export const audioService = new AudioService();
