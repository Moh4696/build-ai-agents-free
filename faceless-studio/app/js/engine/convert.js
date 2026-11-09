import { FFmpeg } from '../../vendor/ffmpeg/index.js';
import { UserError } from './util.js';

let ffmpegPromise = null;

function getFFmpeg(onLog) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ff = new FFmpeg();
      const base = new URL('../../vendor/ffmpeg-core/', import.meta.url).href;
      await ff.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
      return ff;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise.then((ff) => {
    ff.off?.('log');
    if (onLog) ff.on('log', onLog);
    return ff;
  });
}

/** Converts any exported video into a TikTok/Instagram/YouTube-safe MP4 (H.264 + AAC). */
export async function toSocialMp4(result, { onProgress, signal } = {}) {
  let ff;
  try {
    ff = await getFFmpeg();
  } catch (err) {
    throw new UserError('The MP4 converter could not start: ' + (err?.message || err));
  }
  const progressHandler = ({ progress }) => onProgress?.({ stage: 'convert', done: Math.round(clamp01(progress) * 1000), total: 1000 });
  ff.on('progress', progressHandler);
  const abort = () => ff.terminate();
  signal?.addEventListener('abort', abort, { once: true });
  const input = 'in.' + result.ext;
  try {
    await ff.writeFile(input, new Uint8Array(await result.blob.arrayBuffer()));
    const videoIsH264 = String(result.codecs?.video || '').startsWith('avc1');
    const args = ['-i', input];
    if (videoIsH264) args.push('-c:v', 'copy');
    else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high');
    args.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-y', 'out.mp4');
    const code = await ff.exec(args);
    if (code !== 0) throw new Error('ffmpeg exit code ' + code);
    const data = await ff.readFile('out.mp4');
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile('out.mp4').catch(() => {});
    return {
      ...result,
      blob: new Blob([data.buffer], { type: 'video/mp4' }),
      ext: 'mp4',
      codecs: { container: 'mp4', video: videoIsH264 ? result.codecs.video : 'h264 (converted)', audio: 'aac (converted)' },
      socialReady: true,
    };
  } catch (err) {
    if (signal?.aborted) {
      ffmpegPromise = null;
      throw new DOMException('Cancelled', 'AbortError');
    }
    throw new UserError('MP4 conversion failed: ' + (err?.message || err) + '. Your original file is still available to download.');
  } finally {
    ff.off('progress', progressHandler);
    signal?.removeEventListener('abort', abort);
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
