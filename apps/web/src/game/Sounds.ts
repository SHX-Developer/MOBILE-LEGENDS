/**
 * Tiny synthesised SFX. We avoid shipping audio files — every sound is
 * generated on demand from oscillator/noise nodes with a quick gain envelope.
 * AudioContext is lazily created on the first user gesture so iOS/Telegram
 * don't block playback.
 */

import type { HeroKind } from './constants.js';

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

  /**
   * Skill cast SFX — branches on hero kind so the ranger and the mage
   * never sound the same spell. Both still distinguish Q / E / C.
   *
   *   ranger:
   *     q POWER — bright high-bow whoosh + click (snappy plucky burst)
   *     e SLOW  — soft chime descent (the icy slow vibe)
   *     c STUN  — sharp pluck + pitched buzz (control-y zap)
   *   mage:
   *     q ОГОНЬ  — low fireball whoosh + noise tail
   *     e СТЕНА  — wide flame roar (filtered noise + tonal sweep)
   *     c МЕТЕОР — earth-shaking impact rumble + sub-bass thump
   */
  skill(id: 'q' | 'e' | 'c', hero: HeroKind = 'ranger'): void {
    const ac = ensureCtx();
    if (!ac) return;
    switch (hero) {
      case 'mage': playMageSkill(ac, id); return;
      case 'fighter': playFighterSkill(ac, id); return;
      case 'assassin': playAssassinSkill(ac, id); return;
      case 'tank': playTankSkill(ac, id); return;
      default: playRangerSkill(ac, id);
    }
  },
};

/** Ranger skill SFX. Tones are higher and pluckier — bow energy. */
function playRangerSkill(ac: AudioContext, id: 'q' | 'e' | 'c'): void {
  if (id === 'q') {
    // POWER — fast rising whoosh + crisp click on release.
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.16);
    envelope(gain, ac, 0.22, 0.006, 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.22);

    const click = ac.createBufferSource();
    click.buffer = noiseBuffer(ac, 0.04);
    const cf = ac.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 2200;
    const cg = ac.createGain();
    envelope(cg, ac, 0.08, 0.002, 0.04);
    click.connect(cf).connect(cg).connect(ac.destination);
    click.start();
    return;
  }
  if (id === 'e') {
    // SLOW — chime-y two-note descent with a touch of shimmer.
    for (const [freq, delay, peak] of [
      [880, 0, 0.15],
      [660, 0.06, 0.13],
    ] as Array<[number, number, number]>) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
      const now = ac.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain).connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    }
    return;
  }
  // c — STUN: sharp pluck + buzzing zap (square wave for grit).
  const buzz = ac.createOscillator();
  const buzzGain = ac.createGain();
  buzz.type = 'square';
  buzz.frequency.setValueAtTime(420, ac.currentTime);
  buzz.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.18);
  envelope(buzzGain, ac, 0.18, 0.005, 0.2);
  buzz.connect(buzzGain).connect(ac.destination);
  buzz.start();
  buzz.stop(ac.currentTime + 0.24);

  const ping = ac.createOscillator();
  const pingGain = ac.createGain();
  ping.type = 'triangle';
  ping.frequency.setValueAtTime(1500, ac.currentTime);
  ping.frequency.exponentialRampToValueAtTime(800, ac.currentTime + 0.06);
  envelope(pingGain, ac, 0.14, 0.003, 0.07);
  ping.connect(pingGain).connect(ac.destination);
  ping.start();
  ping.stop(ac.currentTime + 0.1);
}

/** Mage skill SFX. Tones are bassier and breathier — fire/magic energy. */
function playMageSkill(ac: AudioContext, id: 'q' | 'e' | 'c'): void {
  if (id === 'q') {
    // ОГОНЬ — fireball whoosh: low body sweep + filtered noise tail.
    const body = ac.createOscillator();
    const bg = ac.createGain();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(180, ac.currentTime);
    body.frequency.exponentialRampToValueAtTime(620, ac.currentTime + 0.22);
    envelope(bg, ac, 0.22, 0.01, 0.26);
    body.connect(bg).connect(ac.destination);
    body.start();
    body.stop(ac.currentTime + 0.3);

    const flame = ac.createBufferSource();
    flame.buffer = noiseBuffer(ac, 0.32);
    const ff = ac.createBiquadFilter();
    ff.type = 'bandpass';
    ff.frequency.value = 700;
    ff.Q.value = 0.6;
    const fg = ac.createGain();
    envelope(fg, ac, 0.12, 0.02, 0.28);
    flame.connect(ff).connect(fg).connect(ac.destination);
    flame.start();
    return;
  }
  if (id === 'e') {
    // СТЕНА — wide flame roar: long filtered noise + slow tonal sweep.
    const roar = ac.createBufferSource();
    roar.buffer = noiseBuffer(ac, 0.5);
    const rf = ac.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.setValueAtTime(450, ac.currentTime);
    rf.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.4);
    rf.Q.value = 0.9;
    const rg = ac.createGain();
    envelope(rg, ac, 0.18, 0.04, 0.45);
    roar.connect(rf).connect(rg).connect(ac.destination);
    roar.start();

    const tone = ac.createOscillator();
    const tg = ac.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(220, ac.currentTime);
    tone.frequency.exponentialRampToValueAtTime(540, ac.currentTime + 0.4);
    envelope(tg, ac, 0.12, 0.03, 0.4);
    tone.connect(tg).connect(ac.destination);
    tone.start();
    tone.stop(ac.currentTime + 0.45);
    return;
  }
  // c — МЕТЕОР: ground-shaking impact: deep sub thump + crash noise burst.
  const thump = ac.createOscillator();
  const tg = ac.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, ac.currentTime);
  thump.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.4);
  envelope(tg, ac, 0.32, 0.008, 0.45);
  thump.connect(tg).connect(ac.destination);
  thump.start();
  thump.stop(ac.currentTime + 0.5);

  const crash = ac.createBufferSource();
  crash.buffer = noiseBuffer(ac, 0.5);
  const cf = ac.createBiquadFilter();
  cf.type = 'lowpass';
  cf.frequency.setValueAtTime(2000, ac.currentTime);
  cf.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.4);
  const cg = ac.createGain();
  envelope(cg, ac, 0.22, 0.005, 0.45);
  crash.connect(cf).connect(cg).connect(ac.destination);
  crash.start();
}

/** Fighter SFX. Steel-and-grit — sword swings, cloth wave, blade vortex. */
function playFighterSkill(ac: AudioContext, id: 'q' | 'e' | 'c'): void {
  if (id === 'q') {
    // СЕЧЕНИЕ — sword swing: short noise whoosh + metal ring.
    const swoosh = ac.createBufferSource();
    swoosh.buffer = noiseBuffer(ac, 0.18);
    const sf = ac.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.setValueAtTime(900, ac.currentTime);
    sf.frequency.exponentialRampToValueAtTime(1800, ac.currentTime + 0.14);
    sf.Q.value = 0.7;
    const sg = ac.createGain();
    envelope(sg, ac, 0.18, 0.005, 0.16);
    swoosh.connect(sf).connect(sg).connect(ac.destination);
    swoosh.start();

    const ring = ac.createOscillator();
    const rg = ac.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(1100, ac.currentTime + 0.06);
    ring.frequency.exponentialRampToValueAtTime(680, ac.currentTime + 0.18);
    envelope(rg, ac, 0.16, 0.004, 0.14);
    ring.connect(rg).connect(ac.destination);
    ring.start(ac.currentTime + 0.06);
    ring.stop(ac.currentTime + 0.22);
    return;
  }
  if (id === 'e') {
    // РЫВОК — quick travel + impact: rising whoosh then clang.
    const whoosh = ac.createOscillator();
    const wg = ac.createGain();
    whoosh.type = 'sawtooth';
    whoosh.frequency.setValueAtTime(160, ac.currentTime);
    whoosh.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.16);
    envelope(wg, ac, 0.2, 0.005, 0.18);
    whoosh.connect(wg).connect(ac.destination);
    whoosh.start();
    whoosh.stop(ac.currentTime + 0.22);

    const clang = ac.createOscillator();
    const cg = ac.createGain();
    clang.type = 'square';
    clang.frequency.setValueAtTime(620, ac.currentTime + 0.16);
    clang.frequency.exponentialRampToValueAtTime(360, ac.currentTime + 0.28);
    envelope(cg, ac, 0.2, 0.003, 0.12);
    clang.connect(cg).connect(ac.destination);
    clang.start(ac.currentTime + 0.16);
    clang.stop(ac.currentTime + 0.32);
    return;
  }
  // c — ВИХРЬ: spinning blades — fast pulsing tone.
  for (let i = 0; i < 5; i++) {
    const t = ac.currentTime + i * 0.06;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380 + i * 60, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}

/** Assassin SFX. Crisp, metallic, dark-magic. */
function playAssassinSkill(ac: AudioContext, id: 'q' | 'e' | 'c'): void {
  if (id === 'q') {
    // ЛЕЗВИЯ — quick "shink": short bright pluck + metal shimmer.
    const shink = ac.createOscillator();
    const sg = ac.createGain();
    shink.type = 'triangle';
    shink.frequency.setValueAtTime(2200, ac.currentTime);
    shink.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.08);
    envelope(sg, ac, 0.16, 0.003, 0.08);
    shink.connect(sg).connect(ac.destination);
    shink.start();
    shink.stop(ac.currentTime + 0.12);

    const tail = ac.createOscillator();
    const tg = ac.createGain();
    tail.type = 'sine';
    tail.frequency.setValueAtTime(900, ac.currentTime + 0.04);
    envelope(tg, ac, 0.1, 0.005, 0.18);
    tail.connect(tg).connect(ac.destination);
    tail.start(ac.currentTime + 0.04);
    tail.stop(ac.currentTime + 0.24);
    return;
  }
  if (id === 'e') {
    // ТЕНЬ — dark wave: detuned sweep + soft noise hiss.
    const sweep = ac.createOscillator();
    const sg = ac.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(220, ac.currentTime);
    sweep.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.3);
    envelope(sg, ac, 0.2, 0.01, 0.32);
    sweep.connect(sg).connect(ac.destination);
    sweep.start();
    sweep.stop(ac.currentTime + 0.36);

    const hiss = ac.createBufferSource();
    hiss.buffer = noiseBuffer(ac, 0.32);
    const hf = ac.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 1800;
    const hg = ac.createGain();
    envelope(hg, ac, 0.06, 0.02, 0.28);
    hiss.connect(hf).connect(hg).connect(ac.destination);
    hiss.start();
    return;
  }
  // c — КАЗНЬ: brutal finisher: heavy thunk + dissonant ring.
  const thunk = ac.createOscillator();
  const tg = ac.createGain();
  thunk.type = 'sine';
  thunk.frequency.setValueAtTime(220, ac.currentTime);
  thunk.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.3);
  envelope(tg, ac, 0.3, 0.005, 0.32);
  thunk.connect(tg).connect(ac.destination);
  thunk.start();
  thunk.stop(ac.currentTime + 0.36);

  const ring = ac.createOscillator();
  const rg = ac.createGain();
  ring.type = 'square';
  ring.frequency.setValueAtTime(540, ac.currentTime + 0.04);
  ring.frequency.exponentialRampToValueAtTime(380, ac.currentTime + 0.34);
  envelope(rg, ac, 0.16, 0.003, 0.32);
  ring.connect(rg).connect(ac.destination);
  ring.start(ac.currentTime + 0.04);
  ring.stop(ac.currentTime + 0.4);
}

/** Tank SFX. Heavy, bassy, earthy — hammer and stone. */
function playTankSkill(ac: AudioContext, id: 'q' | 'e' | 'c'): void {
  if (id === 'q') {
    // УДАР — hammer slam: deep thud + low-mid metal ring.
    const thud = ac.createOscillator();
    const tg = ac.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(160, ac.currentTime);
    thud.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.22);
    envelope(tg, ac, 0.32, 0.005, 0.26);
    thud.connect(tg).connect(ac.destination);
    thud.start();
    thud.stop(ac.currentTime + 0.3);

    const tone = ac.createOscillator();
    const tng = ac.createGain();
    tone.type = 'square';
    tone.frequency.setValueAtTime(520, ac.currentTime + 0.04);
    tone.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.22);
    envelope(tng, ac, 0.2, 0.005, 0.18);
    tone.connect(tng).connect(ac.destination);
    tone.start(ac.currentTime + 0.04);
    tone.stop(ac.currentTime + 0.26);
    return;
  }
  if (id === 'e') {
    // ЩИТ — protective hum: soft warm chord pulse.
    for (const [freq, peak] of [
      [220, 0.18],
      [330, 0.14],
      [440, 0.1],
    ] as Array<[number, number]>) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(peak, ac.currentTime + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.45);
      osc.connect(g).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.5);
    }
    return;
  }
  // c — ЗЕМЛЕТРЯС: ground pound: massive sub-bass + filtered rumble.
  const sub = ac.createOscillator();
  const sg = ac.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(80, ac.currentTime);
  sub.frequency.exponentialRampToValueAtTime(28, ac.currentTime + 0.6);
  envelope(sg, ac, 0.4, 0.01, 0.6);
  sub.connect(sg).connect(ac.destination);
  sub.start();
  sub.stop(ac.currentTime + 0.66);

  const rumble = ac.createBufferSource();
  rumble.buffer = noiseBuffer(ac, 0.7);
  const rf = ac.createBiquadFilter();
  rf.type = 'lowpass';
  rf.frequency.setValueAtTime(800, ac.currentTime);
  rf.frequency.exponentialRampToValueAtTime(140, ac.currentTime + 0.5);
  const rg = ac.createGain();
  envelope(rg, ac, 0.24, 0.01, 0.6);
  rumble.connect(rf).connect(rg).connect(ac.destination);
  rumble.start();
}
