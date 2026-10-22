import { PeakLimiter } from './limiter-core.js';
class SuperVolumeLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.limiter = new PeakLimiter(sampleRate, 2);
    this.framesUntilMeter = 0;
  }
  process(inputs, outputs) {
    this.limiter.process(inputs[0] ?? [], outputs[0]);
    this.framesUntilMeter -= outputs[0][0]?.length ?? 0;
    if (this.framesUntilMeter <= 0) {
      this.port.postMessage(this.limiter.takeMeter());
      this.framesUntilMeter = Math.round(sampleRate / 10);
    }
    return true;
  }
}
registerProcessor('super-volume-limiter', SuperVolumeLimiter);
