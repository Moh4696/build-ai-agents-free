import { parseScript, cleanText } from './script.js';
import { synthesize } from './voice.js';
import { buildTimeline } from './timeline.js';
import { mixAudio } from './audio.js';
import { Renderer } from './renderer.js';
import { encodeVideo } from './encoder.js';
import { loadFonts } from './captions.js';
import { loadMediaItem, fetchPexelsImages } from './backgrounds.js';
import { buildSrt } from './srt.js';
import { hashString } from './util.js';

export const SIZES = {
  '9:16': { 1080: [1080, 1920], 720: [720, 1280] },
  '1:1': { 1080: [1080, 1080], 720: [720, 720] },
  '16:9': { 1080: [1920, 1080], 720: [1280, 720] },
};

const FONT_BASE = new URL('../../fonts/', import.meta.url);

export function frameSize(project) {
  const s = SIZES[project.aspect] || SIZES['9:16'];
  return s[project.quality === '720' ? 720 : 1080];
}

/**
 * Prepares everything needed to draw frames (no encoding).
 * assets: { voiceBuffer, musicBuffer, mediaBlobs: Blob[], logoBlob }
 */
export async function prepareProject(project, assets = {}, { onProgress, signal, onWarn } = {}) {
  await loadFonts(FONT_BASE);
  const parsed = parseScript(project.script, { template: project.template });
  const seed = hashString(cleanText(project.script) + '|' + project.template + '|' + (project.background?.style || ''));

  const items = [];
  if (parsed.title) items.push({ kind: 'title', words: parsed.title.split(/\s+/).map((t) => ({ text: t, weight: 1 + t.length * 0.35 })) });
  for (const s of parsed.scenes) items.push({ kind: 'scene', ...s });

  const voiceOpts = { ...project.voice, buffer: assets.voiceBuffer };
  const voice = await synthesize(items, voiceOpts, { onProgress, signal });
  const timeline = buildTimeline(items, voice, { template: project.template, attribution: parsed.attribution, brand: project.brand });

  onProgress?.({ stage: 'music' });
  const { buffer: audioBuffer, stats: audioStats } = await mixAudio(timeline, { ...project.music, buffer: assets.musicBuffer }, { seed });

  let media = null;
  const bg = project.background || {};
  if (bg.type === 'media' && assets.mediaBlobs?.length) {
    media = [];
    for (const b of assets.mediaBlobs) media.push(await loadMediaItem(b));
  } else if (bg.type === 'pexels' && project.keys?.pexels) {
    onProgress?.({ stage: 'stock' });
    const [W, H] = frameSize(project);
    const orientation = W < H ? 'portrait' : W > H ? 'landscape' : 'square';
    const keywords = timeline.items.map((it) => (bg.query ? bg.query : it.keyword || parsed.scenes[0]?.keyword || 'abstract'));
    media = await fetchPexelsImages(project.keys.pexels, keywords, orientation, onWarn);
  }

  let logo = null;
  if (assets.logoBlob) {
    try {
      logo = await createImageBitmap(assets.logoBlob);
    } catch {
      onWarn?.('Your logo image could not be read, so it was left out.');
    }
  }

  const renderer = new Renderer({ W: frameSize(project)[0], H: frameSize(project)[1], project: { ...project, attribution: parsed.attribution }, timeline, media, logo, seed });
  return { parsed, timeline, audioBuffer, audioStats, renderer, seed };
}

export async function renderProject(project, assets, { canvas, onProgress, signal, onWarn, forceWebm } = {}) {
  const t0 = performance.now();
  const prep = await prepareProject(project, assets, { onProgress, signal, onWarn });
  const [W, H] = frameSize(project);
  canvas.width = W;
  canvas.height = H;
  const fps = project.fps || 30;
  const result = await encodeVideo({ canvas, renderer: prep.renderer, fps, duration: prep.timeline.duration, audioBuffer: prep.audioBuffer, onProgress, signal, forceWebm });
  return {
    ...result,
    srt: buildSrt(prep.timeline),
    duration: prep.timeline.duration,
    width: W,
    height: H,
    fps,
    scenes: prep.timeline.items.length,
    stats: { ...prep.renderer.stats, audio: prep.audioStats, renderMs: Math.round(performance.now() - t0) },
  };
}
