// Stereo-linked sample-peak limiter. No allocation in the per-sample loop.
// A sliding maximum over the lookahead window catches even single-sample peaks.
export class PeakLimiter {
  constructor(rate, channels = 2) {
    this.delay = Math.max(1, Math.round(rate * 0.005));
    this.size = this.delay + 2;
    this.buffers = Array.from({ length: channels }, () => new Float32Array(this.size));
    this.peaks = new Float64Array(this.size);
    this.indices = new Float64Array(this.size);
    this.head = 0;
    this.tail = 0;
    this.frame = 0;
    this.envelope = 1;
    this.ceiling = Math.pow(10, -1 / 20); // -1 dBFS headroom, not a true-peak guarantee.
    this.release = Math.exp(-1 / (rate * 0.08));
    this.attack = Math.exp(-1 / (rate * 0.0005));
    this.minimumGain = 1;
    this.outputPeak = 0;
  }

  process(input, output) {
    const length = output[0]?.length ?? 0;
    for (let i = 0; i < length; i++) {
      const n = this.frame++;
      const slot = n % this.size;
      let peak = 0;
      for (let c = 0; c < this.buffers.length; c++) {
        const sample = input[c]?.[i] ?? 0;
        const value = Number.isFinite(sample) ? sample : 0;
        this.buffers[c][slot] = value;
        peak = Math.max(peak, Math.abs(value));
      }
      while (this.head !== this.tail && this.indices[this.head] < n - this.delay) this.head = (this.head + 1) % this.size;
      while (this.head !== this.tail) {
        const previous = (this.tail + this.size - 1) % this.size;
        if (this.peaks[previous] > peak) break;
        this.tail = previous;
      }
      this.peaks[this.tail] = peak;
      this.indices[this.tail] = n;
      this.tail = (this.tail + 1) % this.size;
      const maximum = this.peaks[this.head];
      const required = maximum > this.ceiling ? this.ceiling / maximum : 1;
      const coefficient = required < this.envelope ? this.attack : this.release;
      this.envelope = required + coefficient * (this.envelope - required);
      const readSlot = (n - this.delay + this.size) % this.size;
      // The lookahead smooths attack; enforce a final sample bound even during startup.
      let delayedPeak = 0;
      if (n >= this.delay) {
        for (const buffer of this.buffers) delayedPeak = Math.max(delayedPeak, Math.abs(buffer[readSlot]));
      }
      if (delayedPeak > this.ceiling) this.envelope = Math.min(this.envelope, this.ceiling / delayedPeak);
      this.minimumGain = Math.min(this.minimumGain, this.envelope);
      for (let c = 0; c < output.length; c++) {
        const value = n >= this.delay ? (this.buffers[c]?.[readSlot] ?? 0) * this.envelope : 0;
        output[c][i] = value;
        this.outputPeak = Math.max(this.outputPeak, Math.abs(value));
      }
    }
  }

  takeMeter() {
    const meter = { reductionDb: -20 * Math.log10(Math.max(this.minimumGain, 1e-9)), peak: this.outputPeak };
    this.minimumGain = 1;
    this.outputPeak = 0;
    return meter;
  }
}
