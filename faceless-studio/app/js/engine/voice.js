import { UserError } from './util.js';

export const KOKORO_VOICES = [
  { id: 'af_heart', label: 'Heart (US female, warm)' },
  { id: 'af_bella', label: 'Bella (US female, bright)' },
  { id: 'af_nicole', label: 'Nicole (US female, soft)' },
  { id: 'af_sarah', label: 'Sarah (US female, clear)' },
  { id: 'am_michael', label: 'Michael (US male, steady)' },
  { id: 'am_adam', label: 'Adam (US male, deep)' },
  { id: 'am_fenrir', label: 'Fenrir (US male, bold)' },
  { id: 'am_puck', label: 'Puck (US male, playful)' },
  { id: 'bf_emma', label: 'Emma (UK female)' },
  { id: 'bf_isabella', label: 'Isabella (UK female)' },
  { id: 'bm_george', label: 'George (UK male)' },
  { id: 'bm_lewis', label: 'Lewis (UK male)' },
];

const decodeCtx = () => new OfflineAudioContext(1, 1, 48000);

export async function decodeAudio(arrayBuffer) {
  try {
    return await decodeCtx().decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new UserError('That audio file could not be read. Use an MP3, WAV or M4A file.');
  }
}

function bufferFromSamples(samples, sampleRate) {
  const buf = new AudioBuffer({ length: Math.max(1, samples.length), numberOfChannels: 1, sampleRate });
  buf.copyToChannel(samples, 0);
  return buf;
}

export function trimSilence(buffer, threshold = 0.01, padSec = 0.05) {
  const data = buffer.getChannelData(0);
  let start = 0, end = data.length - 1;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  if (start >= end) return buffer;
  const pad = Math.round(padSec * buffer.sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(data.length - 1, end + pad);
  const out = new AudioBuffer({ length: end - start + 1, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(start, end + 1), c);
  return out;
}

let kokoroWorker = null;
let msgId = 0;
const pending = new Map();

let modelHost = null;
export function setModelHost(host) {
  modelHost = host || null;
}

function getWorker() {
  if (!kokoroWorker) {
    kokoroWorker = new Worker(new URL('./kokoro-worker.js', import.meta.url), { type: 'module' });
    kokoroWorker.postMessage({ type: 'init', modelHost });
    kokoroWorker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === 'progress') return p.onProgress?.(e.data);
      pending.delete(e.data.id);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
    kokoroWorker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Voice engine crashed'));
      pending.clear();
      kokoroWorker = null;
    };
  }
  return kokoroWorker;
}

function callKokoro(payload, onProgress) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, ...payload });
  });
}

export async function preloadKokoro(onProgress) {
  try {
    await callKokoro({ type: 'load' }, onProgress);
  } catch (err) {
    throw new UserError(
      'The free AI voice could not load (it downloads about 90 MB the first time and needs internet). ' +
        'Try again, upload your own voiceover, or choose "No voice". Details: ' + err.message
    );
  }
}

async function kokoroSpeak(text, voice, speed) {
  const r = await callKokoro({ type: 'speak', text, voice, speed });
  return trimSilence(bufferFromSamples(r.samples, r.sampleRate));
}

async function elevenSpeak(text, { apiKey, voiceId, modelId }) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: modelId || 'eleven_multilingual_v2' }),
  });
  if (res.status === 401) throw new UserError('ElevenLabs rejected your API key. Check it in Settings.');
  if (res.status === 429) throw new UserError('ElevenLabs says you are out of credits or sending too fast.');
  if (!res.ok) throw new UserError(`ElevenLabs error (${res.status}). Try again or pick another voice option.`);
  const json = await res.json();
  const bytes = Uint8Array.from(atob(json.audio_base64), (c) => c.charCodeAt(0));
  const buffer = await decodeAudio(bytes.buffer);
  return { buffer, alignment: json.alignment };
}

export async function listElevenVoices(apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new UserError('Could not load ElevenLabs voices. Check your API key.');
  const json = await res.json();
  return json.voices.map((v) => ({ id: v.voice_id, label: v.name }));
}

function wordTimesFromAlignment(words, alignment) {
  if (!alignment?.characters) return null;
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const out = [];
  let ci = 0;
  for (const w of words) {
    while (ci < chars.length && /\s/.test(chars[ci])) ci++;
    const s = ci;
    ci = Math.min(chars.length, ci + w.text.length);
    const e = Math.max(s, ci - 1);
    if (s >= chars.length) return null;
    out.push({ start: starts[s], end: ends[e] });
  }
  return out;
}

export function estimateDuration(words, wpm = 160) {
  const secPerWeight = 60 / wpm / 2.9;
  const total = words.reduce((a, w) => a + w.weight, 0) * secPerWeight;
  return Math.max(1.6, total);
}

/**
 * Returns one entry per spoken segment: { buffer|null, duration, wordTimes|null }.
 * segments: [{ text, words }]
 */
export async function synthesize(segments, voice, { onProgress, signal } = {}) {
  const type = voice?.type || 'none';
  const results = [];

  if (type === 'none') {
    for (const s of segments) results.push({ buffer: null, duration: estimateDuration(s.words, voice.wpm || 160), wordTimes: null });
    return { segments: results };
  }

  if (type === 'upload') {
    if (!voice.buffer) throw new UserError('Upload a voiceover audio file first, or pick another voice option.');
    const full = trimSilence(voice.buffer, 0.005, 0.1);
    const weights = segments.map((s) => s.words.reduce((a, w) => a + w.weight, 0));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < segments.length; i++) results.push({ buffer: null, duration: (full.duration * weights[i]) / sum, wordTimes: null });
    return { segments: results, fullBuffer: full };
  }

  if (type === 'kokoro') await preloadKokoro((p) => onProgress?.({ stage: 'voice-download', ...p }));
  if (type === 'elevenlabs' && !voice.apiKey) throw new UserError('Add your ElevenLabs API key in Settings to use premium voices.');

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    onProgress?.({ stage: 'voice', done: i, total: segments.length });
    const text = segments[i].words.map((w) => w.text).join(' ');
    if (type === 'kokoro') {
      const buffer = await kokoroSpeak(text, voice.voiceId || 'af_heart', voice.speed || 1);
      results.push({ buffer, duration: buffer.duration, wordTimes: null });
    } else if (type === 'elevenlabs') {
      const { buffer, alignment } = await elevenSpeak(text, voice);
      results.push({ buffer, duration: buffer.duration, wordTimes: wordTimesFromAlignment(segments[i].words, alignment) });
    } else {
      throw new UserError('Unknown voice option.');
    }
  }
  onProgress?.({ stage: 'voice', done: segments.length, total: segments.length });
  return { segments: results };
}
