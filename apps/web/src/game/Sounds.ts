/**
 * Tiny synthesised SFX. We avoid shipping audio files — every sound is
 * generated on demand from oscillator/noise nodes with a quick gain envelope.
 * AudioContext is lazily created on the first user gesture so iOS/Telegram
 * don't block playback.
 */

let ctx: AudioContext | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function envelope(node: GainNode, ac: AudioContext, peak: number, attack: number, release: number): void {
  const now = ac.currentTime;
  node.gain.setValueAtTime(0.0001, now);
  node.gain.exponentialRampToValueAtTime(peak, now + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function noiseBuffer(ac: AudioContext, durationSec: number): AudioBuffer {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * durationSec), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export const Sounds = {
  /** Call once after the first user-initiated tap to wake the context. */
  unlock(): void {
    ensureCtx();
  },
  setMuted(value: boolean): void {
    muted = value;
  },

  /** Bow release — short bright pluck. */
  attack(): void {
    const ac = ensureCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(360, ac.currentTime + 0.09);
    envelope(gain, ac, 0.18, 0.005, 0.09);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.12);
  },

  /** Generic projectile impact — sharp click with low body. */
  hit(): void {
    const ac = ensureCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ac.currentTime + 0.1);
    envelope(gain, ac, 0.22, 0.004, 0.12);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.14);

    // Layer a tiny noise burst so it sounds like something physical hit.
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer(ac, 0.05);
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const ng = ac.createGain();
    envelope(ng, ac, 0.06, 0.002, 0.05);
    noise.connect(filter).connect(ng).connect(ac.destination);
    noise.start();
  },

  /** Took damage — thicker low bonk. */
  takeDamage(): void {
    const ac = ensureCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ac.currentTime + 0.15);
    envelope(gain, ac, 0.22, 0.005, 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.2);
  },

  /** Skill cast — quick rising sweep. Tone changes with skill id. */
  skill(id: 'q' | 'e' | 'c'): void {
    const ac = ensureCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = id === 'q' ? 220 : id === 'e' ? 320 : 180;
    const end = id === 'q' ? 1100 : id === 'e' ? 980 : 720;
    osc.type = id === 'c' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(start, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(end, ac.currentTime + 0.18);
    envelope(gain, ac, 0.22, 0.008, 0.22);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.26);
  },
};
