import { mulberry32 } from './util.js';

const SR = 48000;

const QUALITY = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
};

export const MOODS = {
  calm: { label: 'Calm / inspiring', tempo: 72, prog: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], pad: 0.16, cutoff: 1400, arp: 'tri', drums: null },
  upbeat: { label: 'Upbeat / energetic', tempo: 112, prog: [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']], pad: 0.09, cutoff: 2200, arp: 'pluck', drums: 'four' },
  dramatic: { label: 'Dramatic / suspense', tempo: 76, prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], pad: 0.17, cutoff: 900, arp: null, drums: 'boom', minorKey: true },
  lofi: { label: 'Lo-fi / chill', tempo: 82, prog: [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7']], pad: 0.13, cutoff: 800, arp: 'tri', drums: 'lofi' },
  corporate: { label: 'Corporate / clean', tempo: 100, prog: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], pad: 0.08, cutoff: 2600, arp: 'pluck', drums: 'light' },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer(ctx, rand) {
  const b = ctx.createBuffer(1, SR, SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return b;
}

function env(ctx, node, t, attack, hold, release, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  node.connect(g);
  return g;
}

function pad(ctx, dest, freqs, t, dur, level, cutoff) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.4;
  const g = env(ctx, lp, t, Math.min(0.6, dur / 3), Math.max(0, dur - 0.6), 1.2, level / freqs.length);
  g.connect(dest);
  for (const f of freqs) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 1.3);
    }
  }
}

function pluck(ctx, dest, f, t, level, type) {
  const o = ctx.createOscillator();
  o.type = type === 'pluck' ? 'square' : 'triangle';
  o.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(type === 'pluck' ? 3500 : 2500, t);
  lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
  o.connect(lp);
  env(ctx, lp, t, 0.005, 0.02, 0.35, level).connect(dest);
  o.start(t);
  o.stop(t + 0.45);
}

function bass(ctx, dest, f, t, dur, level) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = f;
  env(ctx, o, t, 0.01, Math.max(0, dur - 0.15), 0.12, level).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.2);
}

function kick(ctx, dest, t, level) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  env(ctx, o, t, 0.002, 0.02, 0.3, level).connect(dest);
  o.start(t);
  o.stop(t + 0.4);
}

function noiseHit(ctx, dest, noise, t, type, freq, decay, level) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  s.connect(f);
  env(ctx, f, t, 0.001, 0.005, decay, level).connect(dest);
  s.start(t, (t * 7.3) % 0.5);
  s.stop(t + decay + 0.05);
}

async function renderLoop(moodId, seed) {
  const mood = MOODS[moodId] || MOODS.calm;
  const rand = mulberry32(seed);
  const beat = 60 / mood.tempo;
  const bar = beat * 4;
  const bars = 8;
  const loopLen = bars * bar;
  const tail = 2;
  const ctx = new OfflineAudioContext(2, Math.ceil((loopLen + tail) * SR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const noise = noiseBuffer(ctx, rand);
  const rootMidi = [55, 57, 58, 60, 62][Math.floor(rand() * 5)];
  const arpPattern = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [2, 1, 0, 1]][Math.floor(rand() * 4)];

  for (let b = 0; b < bars; b++) {
    const [deg, q] = mood.prog[b % mood.prog.length];
    const t = b * bar;
    const chord = QUALITY[q].map((iv) => rootMidi + deg + iv);
    pad(ctx, master, chord.map(mtof), t, bar, mood.pad, mood.cutoff);
    bass(ctx, master, mtof(rootMidi + deg - 24 - (deg > 6 ? 12 : 0)), t, bar * 0.95, 0.22);

    if (mood.arp) {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        if (b >= 4 || s % 2 === 0 || mood.drums) {
          const n = chord[arpPattern[s % 4] % chord.length] + 12;
          pluck(ctx, master, mtof(n), t + (s * bar) / steps, mood.arp === 'pluck' ? 0.05 : 0.07, mood.arp);
        }
      }
    }

    for (let k = 0; k < 4; k++) {
      const bt = t + k * beat;
      switch (mood.drums) {
        case 'four':
          kick(ctx, master, bt, 0.55);
          noiseHit(ctx, master, noise, bt + beat / 2, 'highpass', 7500, 0.05, 0.12);
          break;
        case 'light':
          if (k % 2 === 0) kick(ctx, master, bt, 0.4);
          noiseHit(ctx, master, noise, bt + beat / 2, 'highpass', 8000, 0.04, 0.07);
          break;
        case 'lofi':
          if (k === 0 || k === 2) kick(ctx, master, bt, 0.45);
          if (k === 1 || k === 3) noiseHit(ctx, master, noise, bt, 'bandpass', 1800, 0.16, 0.22);
          noiseHit(ctx, master, noise, bt + beat * 0.58, 'highpass', 6000, 0.04, 0.06);
          break;
        case 'boom':
          if (k === 0) kick(ctx, master, bt, 0.7);
          break;
      }
    }
  }
  const rendered = await ctx.startRendering();
  return { rendered, loopLen };
}

const loopCache = new Map();

export async function generateMusic(moodId, duration, seed = 1) {
  const key = moodId + ':' + seed;
  if (!loopCache.has(key)) loopCache.set(key, renderLoop(moodId, seed));
  const { rendered, loopLen } = await loopCache.get(key);
  const length = Math.ceil(duration * SR);
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SR });
  const loopSamples = Math.round(loopLen * SR);
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let start = 0; start < length; start += loopSamples) {
      const n = Math.min(src.length, length - start);
      for (let i = 0; i < n; i++) dst[start + i] += src[i];
    }
  }
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const fadeIn = Math.min(length, SR), fadeOut = Math.min(length, 2 * SR);
  const norm = peak > 0 ? 0.5 / peak : 1;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      let g = norm;
      if (i < fadeIn) g *= i / fadeIn;
      if (i > length - fadeOut) g *= (length - i) / fadeOut;
      d[i] *= g;
    }
  }
  return out;
}
