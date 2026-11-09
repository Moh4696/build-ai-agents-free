import { KokoroTTS, env } from '../../vendor/kokoro/kokoro.mjs';

env.backends.onnx.wasm.wasmPaths = new URL('../../vendor/kokoro/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;

function load(id) {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress') postMessage({ id, type: 'progress', loaded: p.loaded, total: p.total, file: p.file });
      },
    }).catch((err) => {
      ttsPromise = null;
      throw err;
    });
  }
  return ttsPromise;
}

onmessage = async (e) => {
  const { id, type, text, voice, speed } = e.data;
  if (type === 'init') {
    if (e.data.modelHost) {
      const host = e.data.modelHost.endsWith('/') ? e.data.modelHost : e.data.modelHost + '/';
      env.remoteHost = host;
      globalThis.__FS_MODEL_BASE = host + MODEL_ID + '/resolve/main/';
    }
    return;
  }
  try {
    const tts = await load(id);
    if (type === 'load') {
      postMessage({ id, type: 'done' });
      return;
    }
    const out = await tts.generate(text, { voice, speed });
    const samples = out.audio;
    postMessage({ id, type: 'done', samples, sampleRate: out.sampling_rate }, [samples.buffer]);
  } catch (err) {
    postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
