import { generateMusic } from './music.js';

const SR = 48000;
const VOICE_RMS = 0.1;
const MUSIC_BASE = 0.32;
const DUCK = 0.3;
const PEAK_CEILING = 0.89;

function rms(buffer) {
  let sum = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (Math.abs(v) > 0.003) {
        sum += v * v;
        n++;
      }
    }
  }
  return n ? Math.sqrt(sum / n) : 0;
}

function peakOf(buffer) {
  let p = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

function voiceGain(buffer) {
  const r = rms(buffer);
  const p = peakOf(buffer);
  if (!r || !p) return 1;
  return Math.min(VOICE_RMS / r, 0.95 / p);
}

function mergeIntervals(list) {
  const sorted = list.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 0.4) last[1] = Math.max(last[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
}

export async function mixAudio(timeline, music = {}, { seed = 1 } = {}) {
  const length = Math.max(1, Math.ceil(timeline.duration * SR));
  const ctx = new OfflineAudioContext(2, length, SR);

  const voiceBus = ctx.createGain();
  voiceBus.connect(ctx.destination);
  const intervals = [];
  for (const clip of timeline.voiceClips) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    const g = ctx.createGain();
    g.gain.value = voiceGain(clip.buffer);
    src.connect(g).connect(voiceBus);
    src.start(clip.start);
    intervals.push([clip.start, clip.start + clip.buffer.duration]);
  }

  let musicBuffer = null;
  if (music.type === 'procedural') musicBuffer = await generateMusic(music.mood || 'calm', timeline.duration, seed);
  else if (music.type === 'upload' && music.buffer) musicBuffer = music.buffer;

  if (musicBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = musicBuffer;
    src.loop = music.type === 'upload';
    const norm = music.type === 'upload' ? Math.min(0.5 / (peakOf(musicBuffer) || 1), 4) : 1;
    const base = MUSIC_BASE * norm * (music.volume ?? 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(base, 0);
    for (const [s, e] of mergeIntervals(intervals)) {
      g.gain.setValueAtTime(base, Math.max(0, s - 0.25));
      g.gain.linearRampToValueAtTime(base * DUCK, s);
      g.gain.setValueAtTime(base * DUCK, e);
      g.gain.linearRampToValueAtTime(base, e + 0.3);
    }
    const fade = Math.min(1.5, timeline.duration / 4);
    g.gain.setValueAtTime(g.gain.value, Math.max(0, timeline.duration - fade));
    src.connect(g).connect(ctx.destination);
    src.start(0);
    if (music.type === 'upload') {
      const fg = ctx.createGain();
      g.disconnect();
      g.connect(fg).connect(ctx.destination);
      fg.gain.setValueAtTime(1, Math.max(0, timeline.duration - fade));
      fg.gain.linearRampToValueAtTime(0, timeline.duration);
    }
  }

  const out = await ctx.startRendering();
  const peak = peakOf(out);
  if (peak > PEAK_CEILING) {
    const k = PEAK_CEILING / peak;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return { buffer: out, stats: { peak: peakOf(out), voiceClips: timeline.voiceClips.length, hasMusic: !!musicBuffer } };
}
