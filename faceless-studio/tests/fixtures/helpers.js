// Loaded into the test browser at /__test/helpers.js
const E = '/js/engine/';

export async function engine() {
  const [pipeline, voice, convert, captions, timeline] = await Promise.all([
    import(E + 'pipeline.js'), import(E + 'voice.js'), import(E + 'convert.js'), import(E + 'captions.js'), import(E + 'timeline.js'),
  ]);
  return { ...pipeline, ...voice, ...convert, ...captions, ...timeline };
}

export async function solidImage(color, w = 1080, h = 1920, label = '') {
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);
  if (label) {
    x.fillStyle = '#000';
    x.font = `bold ${Math.round(h / 3)}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, w / 2, h / 2);
  }
  return c.convertToBlob({ type: 'image/png' });
}

export async function logoBlob() {
  const c = new OffscreenCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#e11d48';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(128, 128, 80, 0, 6.283);
  x.fill();
  x.fillStyle = '#111';
  x.fillRect(96, 96, 64, 64);
  return c.convertToBlob({ type: 'image/png' });
}

async function buildAssets(spec = {}) {
  const a = {};
  if (spec.logo) a.logoBlob = await logoBlob();
  if (spec.mediaColors) a.mediaBlobs = await Promise.all(spec.mediaColors.map((c) => solidImage(c)));
  return a;
}

export async function upload(blob, name) {
  const r = await fetch('/__upload/' + encodeURIComponent(name), { method: 'POST', body: blob });
  if (!r.ok) throw new Error('upload failed');
}

export async function render(project, spec = {}, { name, convert = false, forceWebm = false } = {}) {
  const eng = await engine();
  if (spec.modelHost) eng.setModelHost(spec.modelHost);
  const canvas = document.createElement('canvas');
  const warnings = [];
  const t0 = performance.now();
  let res = await eng.renderProject(project, await buildAssets(spec), { canvas, onWarn: (w) => warnings.push(w), forceWebm });
  const renderMs = performance.now() - t0;
  let convertMs = 0;
  if (convert && !res.socialReady) {
    const t1 = performance.now();
    res = await eng.toSocialMp4(res);
    convertMs = performance.now() - t1;
  }
  if (name) await upload(res.blob, `${name}.${res.ext}`);
  return {
    file: name ? `${name}.${res.ext}` : null, ext: res.ext, size: res.blob.size, codecs: res.codecs, socialReady: res.socialReady,
    duration: res.duration, frames: res.frames, width: res.width, height: res.height, srt: res.srt, stats: res.stats,
    warnings, renderMs: Math.round(renderMs), convertMs: Math.round(convertMs),
  };
}

/** Draws frames without encoding and returns layout statistics. */
export async function layoutStats(project, spec = {}, step = 3) {
  const eng = await engine();
  const prep = await eng.prepareProject(project, await buildAssets(spec));
  const [W, H] = eng.frameSize(project);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const fps = 30;
  const n = Math.round(prep.timeline.duration * fps);
  for (let i = 0; i < n; i += step) prep.renderer.draw(ctx, i / fps);
  return { ...prep.renderer.stats, duration: prep.timeline.duration, scenes: prep.timeline.items.length, words: prep.parsed.wordCount };
}

/** Before encoding: hashes the logo's interior pixels and records its box for each script at several times. */
export async function logoCheck(project, scripts, times = [0.5, 1.0, 2.0]) {
  const eng = await engine();
  const logo = await logoBlob();
  const [W, H] = eng.frameSize(project);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const out = [];
  for (const script of scripts) {
    const prep = await eng.prepareProject({ ...project, script }, { logoBlob: logo });
    for (const t of times) {
      prep.renderer.draw(ctx, t);
      const b = prep.renderer.stats.logoBox;
      const d = ctx.getImageData(b.x + 1, b.y + 1, b.w - 2, b.h - 2).data;
      let h = 2166136261;
      for (let k = 0; k < d.length; k++) {
        h ^= d[k];
        h = Math.imul(h, 16777619);
      }
      out.push({ t, box: `${b.x},${b.y},${b.w}x${b.h}`, hash: h >>> 0 });
    }
  }
  return out;
}

function lum(r, g, b) {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Renders captions over a solid background and measures contrast at the letter edges:
 * every caption pixel is compared with the pixel 3px away, so outlines, boxes and fills all count.
 * Returns the 90th-percentile edge contrast of the worst sampled frame (WCAG ratio, 21 = black on white).
 */
export async function captionContrast(project, bgColor) {
  const eng = await engine();
  const media = [await solidImage(bgColor)];
  const prep = await eng.prepareProject({ ...project, background: { type: 'media' } }, { mediaBlobs: media });
  const [W, H] = eng.frameSize(project);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const safe = eng.safeZone(W, H);
  const sx = Math.round(safe.x), sy = Math.round(safe.y), sw = Math.round(safe.w), sh = Math.round(safe.h);
  const samples = [];
  prep.renderer.chunks.forEach((chunks) => chunks.slice(0, 2).forEach((c) => samples.push(c.start + Math.min(0.5, (c.end - c.start) * 0.8))));
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  let worst = Infinity;
  for (const t of samples.slice(0, 6)) {
    prep.renderer.draw(ctx, t);
    const img = ctx.getImageData(sx, sy, sw, sh).data;
    const L = new Float32Array(sw * sh);
    for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = lum(img[i], img[i + 1], img[i + 2]);
    const edges = [];
    const D = 3;
    for (let y = 0; y < sh - D; y += 1)
      for (let x = 0; x < sw - D; x += 1) {
        const a = L[y * sw + x];
        const r = Math.max(ratio(a, L[y * sw + x + D]), ratio(a, L[(y + D) * sw + x]));
        if (r > 1.3) edges.push(r);
      }
    if (!edges.length) continue;
    edges.sort((a, b) => a - b);
    worst = Math.min(worst, edges[Math.floor(edges.length * 0.9)]);
  }
  return Math.round(worst * 100) / 100;
}

/** Mix analysis: RMS of the final audio inside voice windows vs outside. */
export async function audioAnalysis(project, spec = {}) {
  const eng = await engine();
  if (spec.modelHost) eng.setModelHost(spec.modelHost);
  const prep = await eng.prepareProject(project, {});
  const buf = prep.audioBuffer;
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0, clipped = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) {
      const v = Math.abs(x[i]);
      if (v > peak) peak = v;
      if (v >= 0.999) clipped++;
    }
  }
  const windows = prep.timeline.voiceClips.map((c) => [c.start + 0.1, c.start + c.buffer.duration - 0.1]).filter(([a, b]) => b > a);
  const rmsIn = (ranges) => {
    let s = 0, n = 0;
    for (const [a, b] of ranges) for (let i = Math.floor(a * sr); i < Math.min(d.length, b * sr); i++) { s += d[i] * d[i]; n++; }
    return n ? Math.sqrt(s / n) : 0;
  };
  // Same mix with silent voice clips: this is exactly the (ducked) music that sits under the voice.
  const { mixAudio } = await import('/js/engine/audio.js');
  const silentClips = prep.timeline.voiceClips.map((c) => ({ start: c.start, buffer: new AudioBuffer({ length: c.buffer.length, numberOfChannels: 1, sampleRate: c.buffer.sampleRate }) }));
  const musicOnly = (await mixAudio({ ...prep.timeline, voiceClips: silentClips }, project.music, { seed: prep.seed })).buffer.getChannelData(0);
  const rmsOf = (arr, ranges) => {
    let s = 0, n = 0;
    for (const [a, b] of ranges) for (let i = Math.floor(a * sr); i < Math.min(arr.length, b * sr); i++) { s += arr[i] * arr[i]; n++; }
    return n ? Math.sqrt(s / n) : 0;
  };
  return {
    peak, clipped, duration: buf.duration, voiceClips: windows.length,
    rmsVoice: rmsIn(windows), rmsMusicUnderVoice: rmsOf(musicOnly, windows), rmsAll: rmsIn([[0, buf.duration]]),
    clipDurations: prep.timeline.voiceClips.map((c) => c.buffer.duration),
    sceneStarts: prep.timeline.items.map((it) => it.start),
  };
}
