// Runs the Faceless Studio video engine for the Android app.
// Kotlin calls window.makeVideo(json); results come back through window.AndroidVideo.
import { renderProject } from './js/engine/pipeline.js';
import { toSocialMp4 } from './js/engine/convert.js';
import { setModelHost } from './js/engine/voice.js';

const CHUNK_BYTES = 256 * 1024;

const native = window.AndroidVideo || {
  // Stand-in used when the page is opened in a normal browser for testing.
  onProgress: (stage, done, total) => console.log('progress', stage, done, total),
  onWarning: (text) => console.log('warning', text),
  onStart: (size, ext, meta) => (window.__result = { size, ext, meta: JSON.parse(meta), chunks: [] }),
  onChunk: (b64) => window.__result.chunks.push(b64),
  onDone: () => (window.__done = true),
  onError: (text) => (window.__error = text),
};

/** Builds a full engine project from the few settings the phone app exposes. */
export function projectFrom(opts) {
  const voiceId = opts.voiceId || 'bm_george';
  const mood = opts.mood || 'calm';
  return {
    script: String(opts.script || ''),
    template: opts.template || 'story',
    aspect: '9:16',
    quality: opts.quality === '720' ? '720' : '1080',
    fps: 30,
    captionStyle: opts.captionStyle || 'bold-pop',
    background: { type: 'procedural', style: 'mix' },
    dim: 0.28,
    progressBar: false,
    voice: voiceId === 'none' ? { type: 'none', wpm: 160 } : { type: 'kokoro', voiceId, speed: 1 },
    music: mood === 'none' ? { type: 'none' } : { type: 'procedural', mood, volume: 0.5 },
    brand: { primary: '#1d4ed8', accent: '#facc15', textColor: '#ffffff', handle: '', cta: '', watermark: 'off' },
  };
}

function report(p) {
  const done = Number.isFinite(p.done) ? p.done : Number.isFinite(p.loaded) ? p.loaded : -1;
  const total = Number.isFinite(p.total) ? p.total : -1;
  native.onProgress(String(p.stage || ''), done, total);
}

function blobChunkToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let busy = false;

window.makeVideo = async (json) => {
  if (busy) return native.onError('A video is already being made.');
  busy = true;
  try {
    const opts = JSON.parse(json);
    if (opts.modelHost) setModelHost(opts.modelHost);
    const project = projectFrom(opts);
    if (!project.script.trim()) throw new Error('The script is empty.');

    const canvas = document.createElement('canvas');
    const t0 = performance.now();
    let res = await renderProject(project, {}, { canvas, onProgress: report, onWarn: (w) => native.onWarning(String(w)) });
    if (!res.socialReady) {
      native.onProgress('convert', 0, 1000);
      res = await toSocialMp4(res, { onProgress: report });
    }
    const meta = {
      duration: res.duration, width: res.width, height: res.height, codecs: res.codecs,
      socialReady: res.socialReady, seconds: Math.round((performance.now() - t0) / 100) / 10, srt: res.srt,
    };

    native.onProgress('save', 0, res.blob.size);
    native.onStart(res.blob.size, res.ext, JSON.stringify(meta));
    for (let at = 0; at < res.blob.size; at += CHUNK_BYTES) {
      native.onChunk(await blobChunkToBase64(res.blob.slice(at, at + CHUNK_BYTES)));
      native.onProgress('save', Math.min(at + CHUNK_BYTES, res.blob.size), res.blob.size);
    }
    native.onDone();
  } catch (err) {
    native.onError(String(err?.message || err));
  } finally {
    busy = false;
  }
};

window.videoBridgeReady = true;
native.onProgress('ready', 0, 0);
