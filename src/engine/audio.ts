/**
 * Step 08 — Synthesize sound with Web Audio: filtered noise bursts make clicks and taps.
 * Zero audio files. Unlocked cleanly inside a user gesture (Hold-to-Engage or Sound toggle).
 */
export class ProceduralLensAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public unlockAndEnable(): boolean {
    if (typeof window === 'undefined') return false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer();
      this.buildDrone();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    this.enabled = true;
    return true;
  }

  public setEnabled(next: boolean): void {
    if (next) {
      this.unlockAndEnable();
    } else {
      this.enabled = false;
      this.setEngageHum(0);
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.08);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.22));
    }
    this.noiseBuffer = buffer;
  }

  private buildDrone(): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.value = 112;

    filter.type = 'lowpass';
    filter.frequency.value = 260;

    gain.gain.value = 0.0001;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();

    this.droneOsc = osc;
    this.droneGain = gain;
  }

  /**
   * Synthesizes a crisp mechanical aperture detent click using a bandpass-filtered noise burst
   * plus a short resonant metallic impulse.
   */
  public playDetent(pitchScale = 1, gainScale = 1): void {
    if (!this.enabled || !this.ctx || !this.noiseBuffer) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    // 1. Filtered noise transient (tactile ball-bearing detent)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2400 * pitchScale, now);
    bandpass.Q.value = 4.2;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14 * gainScale, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

    src.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.035);

    // 2. Crisp brass/titanium body ping
    const ping = this.ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(3600 * pitchScale, now);
    ping.frequency.exponentialRampToValueAtTime(1400 * pitchScale, now + 0.022);

    const pingGain = this.ctx.createGain();
    pingGain.gain.setValueAtTime(0.045 * gainScale, now);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);

    ping.connect(pingGain);
    pingGain.connect(this.ctx.destination);
    ping.start(now);
    ping.stop(now + 0.028);
  }

  /**
   * Subtle escapement beat tick synchronized to the single simulation clock.
   */
  public playBeatTick(slowMotion: boolean): void {
    this.playDetent(slowMotion ? 0.68 : 1.05, slowMotion ? 0.55 : 0.42);
  }

  /**
   * Modulates a subtle low-frequency mechanical focus servo hum while Hold-to-Engage is active.
   */
  public setEngageHum(amount: number): void {
    if (!this.ctx || !this.droneGain || !this.droneOsc) return;
    const now = this.ctx.currentTime;
    const clamped = this.enabled ? Math.max(0, Math.min(1, amount)) : 0;
    const targetGain = clamped > 0.01 ? 0.001 + clamped * 0.032 : 0.0001;
    this.droneGain.gain.setTargetAtTime(targetGain, now, 0.05);
    this.droneOsc.frequency.setTargetAtTime(98 + clamped * 76, now, 0.06);
  }

  public dispose(): void {
    if (this.droneOsc) {
      try {
        this.droneOsc.stop();
      } catch {
        // Ignore already-stopped oscillator
      }
      this.droneOsc = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
