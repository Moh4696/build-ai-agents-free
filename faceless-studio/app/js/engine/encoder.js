import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from '../../vendor/mp4-muxer.mjs';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from '../../vendor/webm-muxer.mjs';
import { UserError } from './util.js';

const SR = 48000;

export function hasWebCodecs() {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

async function supported(Enc, cfg) {
  try {
    return (await Enc.isConfigSupported(cfg)).supported;
  } catch {
    return false;
  }
}

export async function pickCodecs(width, height, fps, { forceWebm = false } = {}) {
  const pixels = width * height;
  const vBitrate = pixels >= 1920 * 1080 * 0.9 ? 8_000_000 : 5_000_000;
  const videoCandidates = [
    ...(forceWebm ? [] : [
      { codec: 'avc1.640028', mux: 'avc' },
      { codec: 'avc1.4d0028', mux: 'avc' },
      { codec: 'avc1.420028', mux: 'avc' },
    ]),
    { codec: 'vp09.00.40.08', mux: 'V_VP9' },
    { codec: 'vp8', mux: 'V_VP8' },
  ];
  let video = null;
  for (const c of videoCandidates) {
    const cfg = { codec: c.codec, width, height, bitrate: vBitrate, framerate: fps, ...(c.mux === 'avc' ? { avc: { format: 'avc' } } : {}) };
    if (await supported(VideoEncoder, cfg)) {
      video = { ...c, cfg };
      break;
    }
  }
  if (!video) return null;
  const container = video.mux === 'avc' ? 'mp4' : 'webm';
  const audioCandidates = container === 'mp4' ? [{ codec: 'mp4a.40.2', mux: 'aac', bitrate: 160_000 }, { codec: 'opus', mux: 'opus', bitrate: 128_000 }] : [{ codec: 'opus', mux: 'A_OPUS', bitrate: 128_000 }];
  let audio = null;
  for (const c of audioCandidates) {
    const cfg = { codec: c.codec, sampleRate: SR, numberOfChannels: 2, bitrate: c.bitrate };
    if (await supported(AudioEncoder, cfg)) {
      audio = { ...c, cfg };
      break;
    }
  }
  if (!audio) return null;
  const socialReady = container === 'mp4' && audio.mux === 'aac';
  return { container, video, audio, socialReady };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function encodeVideo({ canvas, renderer, fps, duration, audioBuffer, onProgress, signal, forceWebm }) {
  const width = canvas.width, height = canvas.height;
  if (!hasWebCodecs()) return recordRealtime({ canvas, renderer, fps, duration, audioBuffer, onProgress, signal });
  const codecs = await pickCodecs(width, height, fps, { forceWebm });
  if (!codecs) return recordRealtime({ canvas, renderer, fps, duration, audioBuffer, onProgress, signal });

  const isMp4 = codecs.container === 'mp4';
  const target = isMp4 ? new Mp4Target() : new WebmTarget();
  const muxer = isMp4
    ? new Mp4Muxer({
        target,
        video: { codec: 'avc', width, height, frameRate: fps },
        audio: { codec: codecs.audio.mux, numberOfChannels: 2, sampleRate: SR },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      })
    : new WebmMuxer({
        target,
        video: { codec: codecs.video.mux, width, height, frameRate: fps },
        audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: SR },
        firstTimestampBehavior: 'offset',
      });

  let failure = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
  venc.configure(codecs.video.cfg);
  aenc.configure(codecs.audio.cfg);

  const ctx = canvas.getContext('2d', { alpha: false });
  const total = Math.max(1, Math.round(duration * fps));
  const frameDur = Math.round(1e6 / fps);
  try {
    // Audio first: it is small and finishes quickly.
    const chans = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const CH = 4096;
    for (let off = 0; off < len; off += CH) {
      const n = Math.min(CH, len - off);
      const data = new Float32Array(n * 2);
      for (let c = 0; c < 2; c++) data.set(audioBuffer.getChannelData(Math.min(c, chans - 1)).subarray(off, off + n), c * n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off * 1e6) / SR), data });
      aenc.encode(ad);
      ad.close();
    }

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (failure) throw failure;
      const t = i / fps;
      await renderer.prepare(t);
      renderer.draw(ctx, t);
      const frame = new VideoFrame(canvas, { timestamp: i * frameDur, duration: frameDur });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (i % 10 === 0) {
        onProgress?.({ stage: 'video', done: i, total });
        await tick();
      }
    }
    await venc.flush();
    await aenc.flush();
    if (failure) throw failure;
    muxer.finalize();
  } catch (err) {
    try { venc.close(); } catch {}
    try { aenc.close(); } catch {}
    if (err?.name === 'AbortError') throw err;
    throw new UserError('The video encoder stopped unexpectedly: ' + (err?.message || err) + '. Try the 720p (faster) quality option or close other tabs.');
  }
  venc.close();
  aenc.close();
  onProgress?.({ stage: 'video', done: total, total });
  const mime = isMp4 ? 'video/mp4' : 'video/webm';
  return {
    blob: new Blob([target.buffer], { type: mime }),
    ext: isMp4 ? 'mp4' : 'webm',
    codecs: { container: codecs.container, video: codecs.video.codec, audio: codecs.audio.codec },
    socialReady: codecs.socialReady,
    frames: total,
  };
}

async function recordRealtime({ canvas, renderer, fps, duration, audioBuffer, onProgress, signal }) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new UserError('This browser cannot export video. Please use the latest Chrome or Edge.');
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  const ac = new AudioContext({ sampleRate: SR });
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(dest);
  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  renderer.draw(ctx, 0);
  rec.start(1000);
  const t0 = ac.currentTime + 0.05;
  src.start(t0);
  await new Promise((resolve, reject) => {
    const loop = async () => {
      if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      const t = ac.currentTime - t0;
      if (t >= duration) return resolve();
      await renderer.prepare(Math.max(0, t));
      renderer.draw(ctx, Math.max(0, t));
      onProgress?.({ stage: 'video', done: Math.floor(t * fps), total: Math.round(duration * fps) });
      requestAnimationFrame(loop);
    };
    loop();
  }).finally(() => {
    rec.stop();
    src.stop();
  });
  await stopped;
  await ac.close();
  const isMp4 = mime.startsWith('video/mp4');
  return { blob: new Blob(parts, { type: isMp4 ? 'video/mp4' : 'video/webm' }), ext: isMp4 ? 'mp4' : 'webm', codecs: { container: isMp4 ? 'mp4' : 'webm', video: mime, audio: mime, realtime: true }, socialReady: isMp4, frames: Math.round(duration * fps) };
}
