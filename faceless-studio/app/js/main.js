import { CONFIG } from './config.js';
import * as store from './storage.js';
import { currentLicense, activate, revalidate, deactivateLocal } from './license.js';
import { CAPTION_STYLES, FONTS, drawCaption, loadFonts } from './engine/captions.js';
import { BG_STYLES } from './engine/backgrounds.js';
import { MOODS, generateMusic } from './engine/music.js';
import { KOKORO_VOICES, decodeAudio, listElevenVoices, preloadKokoro, synthesize, setModelHost } from './engine/voice.js';
import { TEMPLATES } from './engine/renderer.js';
import { prepareProject, renderProject, frameSize } from './engine/pipeline.js';
import { toSocialMp4 } from './engine/convert.js';
import { splitBatch, cleanText, parseScript } from './engine/script.js';
import { UserError } from './engine/util.js';
import { zipSync } from '../vendor/fflate.mjs';

const $ = (id) => document.getElementById(id);
const FONT_BASE = new URL('../fonts/', import.meta.url);

const DEFAULT = {
  script: '',
  template: 'story',
  aspect: '9:16',
  quality: '1080',
  fps: 30,
  captionStyle: 'bold-pop',
  background: { type: 'procedural', style: 'mix', query: '' },
  dim: 0.28,
  progressBar: false,
  voice: { type: 'kokoro', voiceId: 'af_heart', speed: 1, wpm: 160, elevenVoiceId: '' },
  music: { type: 'procedural', mood: 'calm', volume: 0.6 },
  brand: { primary: '#6d28d9', accent: '#facc15', textColor: '#ffffff', font: '', handle: '', cta: '', watermark: 'top-right' },
  batch: false,
  autoMp4: true,
  kitId: '',
};

const SAMPLE = `# 3 Habits That Quietly Change Your Life
1. Wake up thirty minutes earlier. Those quiet minutes are pure gold for planning your day.
2. Read ten pages every single day. That's over a dozen books a year!
3. Take a walk without your phone. Your best ideas show up when your mind can wander.
Which one will you try first?`;

let project = structuredClone(DEFAULT);
let license = currentLicense();
let keys = store.loadKeys();
const assets = { voiceBuffer: null, voiceBlob: null, musicBuffer: null, musicBlob: null, mediaBlobs: [], logoBlob: null };
const results = [];
let abort = null;
let rendering = false;

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

const isPro = () => license.tier === 'pro';

function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  $('saveState').textContent = 'Saving…';
  saveTimer = setTimeout(() => {
    $('saveState').textContent = store.saveProject(project) ? 'All changes saved' : 'Could not save (private window?)';
  }, 400);
  schedulePreview();
}

// ---------- form wiring ----------
function fillSelect(sel, entries, value) {
  sel.innerHTML = '';
  for (const [v, label, disabled] of entries) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    if (disabled) o.disabled = true;
    sel.appendChild(o);
  }
  if (value != null) sel.value = value;
}

function setPath(path, value) {
  const parts = path.split('.');
  let o = project;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}
function getPath(path) {
  return path.split('.').reduce((o, k) => o?.[k], project);
}

function bind(id, path, { event = 'input', parse = (v) => v, out } = {}) {
  const el = $(id);
  const isCheck = el.type === 'checkbox';
  const sync = () => {
    const v = getPath(path);
    if (isCheck) el.checked = !!v;
    else el.value = v ?? '';
    if (out) $(out).textContent = formatOut(id, v);
  };
  el.addEventListener(event, () => {
    setPath(path, isCheck ? el.checked : parse(el.value));
    if (out) $(out).textContent = formatOut(id, getPath(path));
    afterChange(path);
  });
  sync();
  return sync;
}

function formatOut(id, v) {
  if (id === 'dim' || id === 'volume') return Math.round(v * 100) + '%';
  if (id === 'speed') return Number(v).toFixed(2) + '×';
  return String(v);
}

function bindSeg(id, path) {
  const seg = $(id);
  const sync = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === getPath(path)));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('locked')) return proNudge(b);
    setPath(path, b.dataset.v);
    sync();
    afterChange(path);
  });
  sync();
  return sync;
}

function bindRadios(name, path) {
  const radios = document.querySelectorAll(`input[name=${name}]`);
  const sync = () => radios.forEach((r) => (r.checked = r.value === getPath(path)));
  radios.forEach((r) =>
    r.addEventListener('change', () => {
      if (r.closest('label').classList.contains('locked')) {
        sync();
        return proNudge(r);
      }
      setPath(path, r.value);
      afterChange(path);
    })
  );
  sync();
  return sync;
}

function proNudge(el) {
  if (el && el.closest?.('.locked')) toast('That is a Pro feature. Upgrade your license to unlock it.');
}

const syncers = [];
function syncAll() {
  syncers.forEach((s) => s());
  updateVisibility();
  updateCounts();
  renderCaptionCards();
}

function afterChange(path) {
  if (path === 'template') {
    const def = TEMPLATES[project.template]?.defaultCaption;
    if (def && (!CAPTION_STYLES[def].pro || isPro())) project.captionStyle = def;
    renderCaptionCards();
  }
  if (path === 'brand.accent' || path === 'brand.primary' || path === 'brand.textColor' || path === 'brand.font') renderCaptionCards();
  if (path.startsWith('brand.')) project.kitId = '';
  updateVisibility();
  updateCounts();
  save();
}

function updateVisibility() {
  const state = { bgType: project.background.type, voiceType: project.voice.type, musicType: project.music.type };
  document.querySelectorAll('[data-show]').forEach((el) => {
    const [k, v] = el.dataset.show.split('=');
    el.hidden = state[k] !== v;
  });
  document.querySelectorAll('[data-hide]').forEach((el) => {
    const [k, v] = el.dataset.hide.split('=');
    el.hidden = state[k] === v;
  });
}

function updateCounts() {
  const scripts = project.batch ? splitBatch(project.script) : [project.script];
  const words = cleanText(project.script).split(/\s+/).filter(Boolean).length;
  const wpm = project.voice.type === 'none' ? project.voice.wpm : 165 * (project.voice.type === 'kokoro' ? project.voice.speed : 1);
  const secs = Math.round((words / wpm) * 60);
  $('wordCount').textContent = `${words} words${project.batch ? ` · ${scripts.length} video${scripts.length === 1 ? '' : 's'}` : ''}`;
  $('estLength').textContent = words ? `≈ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} ${project.batch ? 'total' : 'long'}` : '';
}

// ---------- caption style picker ----------
function renderCaptionCards() {
  const wrap = $('captionStyles');
  if (!wrap.childElementCount) {
    for (const [id, s] of Object.entries(CAPTION_STYLES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cap-card';
      b.dataset.id = id;
      b.innerHTML = `<canvas width="320" height="200"></canvas><span>${s.label}</span>${s.pro ? '<i class="pro-tag">PRO</i>' : ''}`;
      b.addEventListener('click', () => {
        if (s.pro && !isPro()) return toast('That caption style is part of Pro.');
        project.captionStyle = id;
        renderCaptionCards();
        afterChange('captionStyle');
      });
      wrap.appendChild(b);
    }
  }
  const words = [
    { text: 'This', start: 0, end: 0.3 },
    { text: 'changes', start: 0.3, end: 0.6 },
    { text: 'everything', start: 0.6, end: 1 },
  ];
  wrap.querySelectorAll('.cap-card').forEach((b) => {
    const id = b.dataset.id;
    b.classList.toggle('active', id === project.captionStyle);
    b.style.opacity = CAPTION_STYLES[id].pro && !isPro() ? 0.55 : 1;
    const c = b.querySelector('canvas');
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 320, 200);
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(1, project.brand.primary);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 200);
    const n = CAPTION_STYLES[id].group;
    const chunkWords = n === 1 ? [words[1]] : words;
    drawCaption(ctx, { W: 320, H: 200, t: 0.45, chunk: { words: chunkWords, start: 0, end: 1 }, styleId: id, brand: project.brand, fontOverride: project.brand.font });
  });
}

// ---------- preview ----------
let preview = null;
let previewT = 0;
let playing = false;
let previewTimer = null;
let previewToken = 0;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(buildPreview, 450);
}

async function buildPreview() {
  const token = ++previewToken;
  const script = project.batch ? splitBatch(project.script)[0] || '' : project.script;
  const canvas = $('preview');
  const p = {
    ...project,
    script: script.trim() ? script : SAMPLE,
    quality: '720',
    voice: { type: 'none', wpm: project.voice.type === 'none' ? project.voice.wpm : Math.round(165 * (project.voice.type === 'kokoro' ? project.voice.speed : 1)) },
    music: { type: 'none' },
    background: project.background.type === 'pexels' ? { type: 'procedural', style: 'mix' } : project.background,
  };
  try {
    const prep = await prepareProject(p, { mediaBlobs: assets.mediaBlobs, logoBlob: assets.logoBlob });
    if (token !== previewToken) return;
    const [W, H] = frameSize(p);
    canvas.width = W;
    canvas.height = H;
    preview = prep;
    previewT = Math.min(previewT, prep.timeline.duration);
    drawPreview();
  } catch (err) {
    if (token !== previewToken) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f87171';
    ctx.font = '28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(err instanceof UserError ? 'Check your script' : 'Preview unavailable', canvas.width / 2, canvas.height / 2);
  }
}

async function drawPreview() {
  if (!preview) return;
  const ctx = $('preview').getContext('2d');
  await preview.renderer.prepare(previewT);
  preview.renderer.draw(ctx, previewT);
  const d = preview.timeline.duration;
  $('scrub').value = Math.round((previewT / d) * 1000);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  $('previewTime').textContent = `${fmt(previewT)} / ${fmt(d)}`;
}

function togglePlay() {
  if (!preview) return;
  playing = !playing;
  $('playPreview').textContent = playing ? '❚❚ Pause' : '▶ Play preview';
  let last = performance.now();
  const loop = async (now) => {
    if (!playing) return;
    previewT += (now - last) / 1000;
    last = now;
    if (previewT >= preview.timeline.duration) previewT = 0;
    await drawPreview();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- assets ----------
async function setVoiceFile(blob, persist = true) {
  assets.voiceBlob = blob;
  assets.voiceBuffer = blob ? await decodeAudio(await blob.arrayBuffer()) : null;
  $('voiceFileInfo').textContent = blob ? `${blob.name || 'Saved voiceover'} — ${assets.voiceBuffer.duration.toFixed(1)} s` : '';
  if (persist) await (blob ? store.putFile('voice', blob) : store.deleteFile('voice'));
}
async function setMusicFile(blob, persist = true) {
  assets.musicBlob = blob;
  assets.musicBuffer = blob ? await decodeAudio(await blob.arrayBuffer()) : null;
  $('musicFileInfo').textContent = blob ? `${blob.name || 'Saved music'} — ${assets.musicBuffer.duration.toFixed(1)} s` : '';
  if (persist) await (blob ? store.putFile('music', blob) : store.deleteFile('music'));
}
async function setMedia(blobs, persist = true) {
  assets.mediaBlobs = blobs;
  const list = $('bgMediaList');
  list.innerHTML = '';
  blobs.forEach((b, i) => {
    const s = document.createElement('span');
    s.className = 'chip';
    s.textContent = `${i + 1}. ${b.name || (b.type.startsWith('video') ? 'video' : 'image')}`;
    list.appendChild(s);
  });
  if (persist) await store.putFile('media', blobs);
  schedulePreview();
}
async function setLogo(blob, persist = true) {
  assets.logoBlob = blob;
  const img = $('logoPreview');
  if (img.src) URL.revokeObjectURL(img.src);
  img.hidden = !blob;
  $('removeLogo').hidden = !blob;
  if (blob) img.src = URL.createObjectURL(blob);
  else img.removeAttribute('src');
  if (persist) await (blob ? store.putFile('logo', blob) : store.deleteFile('logo'));
  schedulePreview();
}

// ---------- brand kits ----------
function refreshKits() {
  const kits = store.loadKits();
  fillSelect($('kitSelect'), [['', '(unsaved)'], ...kits.map((k) => [k.id, k.name])], project.kitId || '');
}
async function applyKit(id) {
  const kit = store.loadKits().find((k) => k.id === id);
  if (!kit) return;
  project.brand = deepMerge(DEFAULT.brand, kit.brand);
  project.kitId = id;
  await setLogo((await store.getFile('kitlogo:' + id)) || null);
  syncAll();
  save();
  toast(`Brand kit "${kit.name}" applied`);
}

// ---------- rendering ----------
function setProgress(frac, text) {
  $('progress').hidden = false;
  $('progress').querySelector('.bar span').style.width = `${Math.round(frac * 100)}%`;
  $('progressText').textContent = text;
}

function describeProgress(p, idx, total) {
  const prefix = total > 1 ? `Video ${idx + 1} of ${total}: ` : '';
  switch (p.stage) {
    case 'voice-download':
      return [0.02, `${prefix}Downloading the free AI voice (first time only)… ${p.total ? Math.round((p.loaded / p.total) * 100) + '%' : ''}`];
    case 'voice':
      return [0.05 + 0.25 * (p.done / Math.max(1, p.total)), `${prefix}Creating voiceover… ${p.done}/${p.total} scenes`];
    case 'music':
      return [0.3, `${prefix}Mixing music…`];
    case 'stock':
      return [0.32, `${prefix}Finding stock photos…`];
    case 'video':
      return [0.35 + 0.55 * (p.done / Math.max(1, p.total)), `${prefix}Rendering video… ${Math.round((p.done / Math.max(1, p.total)) * 100)}%`];
    case 'convert':
      return [0.9 + 0.1 * (p.done / Math.max(1, p.total)), `${prefix}Converting to MP4… ${Math.round((p.done / Math.max(1, p.total)) * 100)}%`];
  }
  return [0, prefix + 'Working…'];
}

function slugFor(script, i) {
  let name = 'video';
  try {
    const parsed = parseScript(script, { template: project.template });
    name = (parsed.title || parsed.scenes[0].text).split(/\s+/).slice(0, 6).join(' ');
  } catch {}
  return (name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'video') + (i != null ? `-${i + 1}` : '');
}

function checkProUsage() {
  if (isPro()) return null;
  if (CAPTION_STYLES[project.captionStyle]?.pro) return 'The selected caption style is a Pro feature.';
  if (TEMPLATES[project.template]?.pro) return 'The selected template is a Pro feature.';
  if (project.voice.type === 'elevenlabs') return 'ElevenLabs voices are a Pro feature.';
  if (project.background.type === 'pexels') return 'Stock photos are a Pro feature.';
  if (project.batch) return 'Batch mode is a Pro feature.';
  return null;
}

function addWarning(msg, isError = false) {
  const li = document.createElement('li');
  li.textContent = msg;
  if (isError) li.className = 'error';
  $('warnings').appendChild(li);
}

async function startRender() {
  if (rendering) return;
  $('warnings').innerHTML = '';
  const proIssue = checkProUsage();
  if (proIssue) return addWarning(proIssue + ' Choose another option or upgrade.', true);
  const scripts = project.batch ? splitBatch(project.script) : [project.script];
  if (!cleanText(project.script)) return addWarning('Your script is empty. Paste or type a script first (or click "Load an example").', true);
  if (project.voice.type === 'elevenlabs' && !keys.eleven) return addWarning('Add your ElevenLabs API key in Settings first.', true);
  if (project.voice.type === 'elevenlabs' && !project.voice.elevenVoiceId) return addWarning('Load your ElevenLabs voices and pick one first.', true);
  if (project.background.type === 'pexels' && !keys.pexels) return addWarning('Add your free Pexels API key in Settings first, or pick another background.', true);
  if (project.background.type === 'media' && !assets.mediaBlobs.length) return addWarning('Upload at least one background image or video, or pick another background.', true);

  rendering = true;
  abort = new AbortController();
  store.markRendering(true);
  $('render').disabled = true;
  $('cancel').hidden = false;
  if (playing) togglePlay();
  const canvas = document.createElement('canvas');
  const voice = { ...project.voice, apiKey: keys.eleven, voiceId: project.voice.type === 'elevenlabs' ? project.voice.elevenVoiceId : project.voice.voiceId };
  let done = 0;
  try {
    for (let i = 0; i < scripts.length; i++) {
      const onProgress = (p) => {
        const [f, text] = describeProgress(p, i, scripts.length);
        setProgress((i + f) / scripts.length, text);
      };
      try {
        let res = await renderProject(
          { ...project, script: scripts[i], voice, keys: { pexels: keys.pexels } },
          assets,
          { canvas, onProgress, signal: abort.signal, onWarn: (w) => addWarning(w) }
        );
        if (project.autoMp4 && !res.socialReady) {
          try {
            res = await toSocialMp4(res, { onProgress, signal: abort.signal });
          } catch (err) {
            if (err?.name === 'AbortError') throw err;
            addWarning(err.message);
          }
        }
        addResult(res, slugFor(scripts[i], scripts.length > 1 ? i : null));
        done++;
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const msg = err instanceof UserError ? err.message : `Something went wrong: ${err?.message || err}. Try 720p quality or reload the page.`;
        addWarning((scripts.length > 1 ? `Video ${i + 1}: ` : '') + msg, true);
        if (!(err instanceof UserError)) console.error(err);
      }
    }
    setProgress(1, done === scripts.length ? `Done! ${done} video${done === 1 ? '' : 's'} ready below.` : `Finished with problems: ${done} of ${scripts.length} videos made.`);
  } catch (err) {
    setProgress(0, 'Cancelled.');
  } finally {
    rendering = false;
    abort = null;
    store.markRendering(false);
    $('render').disabled = false;
    $('cancel').hidden = true;
  }
}

function fmtBytes(n) {
  return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function addResult(res, name) {
  const entry = { ...res, name, url: URL.createObjectURL(res.blob) };
  results.push(entry);
  drawResults();
}

function drawResults() {
  const wrap = $('results');
  wrap.innerHTML = '';
  if (results.length > 1) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = `Download all ${results.length} videos (.zip)`;
    b.onclick = downloadZip;
    wrap.appendChild(b);
  }
  results.forEach((r, idx) => {
    const el = document.createElement('div');
    el.className = 'result';
    el.innerHTML = `<video src="${r.url}" controls playsinline preload="metadata"></video>
      <div><h3></h3>
      <div class="meta">${r.width}×${r.height} · ${r.duration.toFixed(1)} s · ${fmtBytes(r.blob.size)} · ${r.ext.toUpperCase()}<br>
      ${r.socialReady ? '<span class="ready">✓ Ready for TikTok, Instagram & YouTube</span>' : '<span class="notready">WebM file: works on YouTube. Convert to MP4 for TikTok & Instagram.</span>'}</div>
      <div class="actions"></div></div>`;
    el.querySelector('h3').textContent = r.name;
    const actions = el.querySelector('.actions');
    const mk = (label, fn, cls = 'btn small') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      actions.appendChild(b);
      return b;
    };
    mk('Download video', () => download(r.blob, `${r.name}.${r.ext}`), 'btn small primary');
    mk('Subtitles (.srt)', () => download(new Blob([r.srt], { type: 'text/plain' }), `${r.name}.srt`));
    if (!r.socialReady)
      mk('Convert to MP4', async (e) => {
        e.target.disabled = true;
        try {
          const conv = await toSocialMp4(r, { onProgress: (p) => (e.target.textContent = `Converting… ${Math.round((p.done / p.total) * 100)}%`) });
          URL.revokeObjectURL(r.url);
          results[idx] = { ...conv, name: r.name, url: URL.createObjectURL(conv.blob) };
          drawResults();
        } catch (err) {
          e.target.disabled = false;
          e.target.textContent = 'Convert to MP4';
          toast(err.message, 6000);
        }
      });
    mk('Remove', () => {
      URL.revokeObjectURL(r.url);
      results.splice(idx, 1);
      drawResults();
    }, 'btn small ghost');
    wrap.appendChild(el);
  });
}

async function downloadZip() {
  const total = results.reduce((a, r) => a + r.blob.size, 0);
  if (total > 1.5e9) return toast('Too big for one zip. Download the videos one by one.', 6000);
  const files = {};
  for (const r of results) {
    files[`${r.name}.${r.ext}`] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }];
    files[`${r.name}.srt`] = new TextEncoder().encode(r.srt);
  }
  download(new Blob([zipSync(files)], { type: 'application/zip' }), 'faceless-studio-videos.zip');
}

// ---------- license / pro gating ----------
function applyLicenseUI() {
  const badge = $('tierBadge');
  badge.textContent = license.mode === 'service' ? 'Studio' : license.tier === 'pro' ? 'Pro' : 'Basic';
  badge.classList.toggle('pro', isPro());
  document.querySelectorAll('[data-pro]').forEach((el) => {
    const locked = !isPro();
    el.classList.toggle('locked', locked);
    el.querySelectorAll('input,select,button').forEach((i) => {
      if (i.type !== 'radio') i.disabled = locked;
    });
  });
  for (const opt of $('template').options) opt.disabled = !!TEMPLATES[opt.value]?.pro && !isPro();
  $('licenseInfo').innerHTML = '';
  const info = document.createElement('p');
  if (license.mode === 'service') info.textContent = 'Studio mode: all features unlocked (license check is switched off in config.js).';
  else {
    info.textContent = `License: ${license.tier === 'pro' ? 'Pro' : 'Basic'} (${license.key ? license.key.slice(0, 8) + '…' : ''}). `;
    const b = document.createElement('button');
    b.className = 'btn ghost small';
    b.type = 'button';
    b.textContent = 'Remove license from this browser';
    b.onclick = () => {
      deactivateLocal();
      location.reload();
    };
    info.appendChild(b);
  }
  $('licenseInfo').appendChild(info);
  if (!isPro()) {
    if (CAPTION_STYLES[project.captionStyle]?.pro) project.captionStyle = 'bold-pop';
    if (TEMPLATES[project.template]?.pro) project.template = 'story';
    if (project.voice.type === 'elevenlabs') project.voice.type = 'kokoro';
    if (project.background.type === 'pexels') project.background.type = 'procedural';
    project.batch = false;
  }
}

function showLock() {
  $('lock').hidden = false;
  $('buyLink').href = CONFIG.buyUrl;
  const go = async () => {
    $('activate').disabled = true;
    $('lockMsg').textContent = 'Checking…';
    const r = await activate($('licenseKey').value);
    $('activate').disabled = false;
    if (!r.ok) return ($('lockMsg').textContent = r.message);
    license = currentLicense();
    $('lock').hidden = true;
    applyLicenseUI();
    syncAll();
    toast(`Unlocked! Welcome to Faceless Studio ${r.tier === 'pro' ? 'Pro' : ''}.`);
  };
  $('activate').onclick = go;
  $('licenseKey').addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

// ---------- init ----------
async function init() {
  document.title = `${CONFIG.appName} — script to video`;
  $('appName').textContent = CONFIG.appName;
  setModelHost(CONFIG.voiceModelHost);
  project = deepMerge(DEFAULT, store.loadProject() || {});
  if (!project.script) project.script = '';

  fillSelect($('template'), Object.entries(TEMPLATES).map(([k, v]) => [k, v.label + (v.pro ? ' (Pro)' : '')]));
  fillSelect($('bgStyle'), Object.entries(BG_STYLES));
  fillSelect($('kokoroVoice'), KOKORO_VOICES.map((v) => [v.id, v.label]));
  fillSelect($('mood'), Object.entries(MOODS).map(([k, v]) => [k, v.label]));
  fillSelect($('font'), [['', 'Match caption style'], ...Object.entries(FONTS).map(([k, v]) => [k, v.label])]);

  if (!license.unlocked) showLock();
  applyLicenseUI();

  syncers.push(
    bind('template', 'template', { event: 'change' }),
    bind('script', 'script'),
    bind('batchMode', 'batch', { event: 'change' }),
    bindSeg('aspect', 'aspect'),
    bindSeg('bgType', 'background.type'),
    bind('bgStyle', 'background.style', { event: 'change' }),
    bind('pexelsQuery', 'background.query'),
    bind('dim', 'dim', { parse: Number, out: 'dimOut' }),
    bind('progressBar', 'progressBar', { event: 'change' }),
    bindRadios('voiceType', 'voice.type'),
    bind('kokoroVoice', 'voice.voiceId', { event: 'change' }),
    bind('speed', 'voice.speed', { parse: Number, out: 'speedOut' }),
    bind('wpm', 'voice.wpm', { parse: Number, out: 'wpmOut' }),
    bind('elevenVoice', 'voice.elevenVoiceId', { event: 'change' }),
    bindRadios('musicType', 'music.type'),
    bind('mood', 'music.mood', { event: 'change' }),
    bind('volume', 'music.volume', { parse: Number, out: 'volOut' }),
    bind('primary', 'brand.primary'),
    bind('accent', 'brand.accent'),
    bind('textColor', 'brand.textColor'),
    bind('font', 'brand.font', { event: 'change' }),
    bind('handle', 'brand.handle'),
    bind('cta', 'brand.cta'),
    bind('watermark', 'brand.watermark', { event: 'change' }),
    bind('quality', 'quality', { event: 'change' }),
    bind('autoMp4', 'autoMp4', { event: 'change' })
  );

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.tabpanel').forEach((p) => p.classList.toggle('active', p.dataset.panel === t.dataset.tab));
    })
  );

  $('loadSample').onclick = () => {
    project.script = SAMPLE;
    project.template = 'listicle';
    syncAll();
    save();
  };
  $('importTxt').onchange = async (e) => {
    const texts = await Promise.all([...e.target.files].map((f) => f.text()));
    if (!texts.length) return;
    project.script = texts.join('\n\n===\n\n');
    if (texts.length > 1) {
      if (isPro()) project.batch = true;
      else toast('Batch mode is Pro: only the combined text was loaded.');
    }
    syncAll();
    save();
    e.target.value = '';
  };

  $('voiceFile').onchange = async (e) => {
    try {
      await setVoiceFile(e.target.files[0] || null);
    } catch (err) {
      toast(err.message, 6000);
    }
  };
  $('musicFile').onchange = async (e) => {
    try {
      await setMusicFile(e.target.files[0] || null);
    } catch (err) {
      toast(err.message, 6000);
    }
  };
  $('bgMedia').onchange = async (e) => {
    const files = [...e.target.files].filter((f) => f.size < 300e6);
    if (files.length < e.target.files.length) toast('Files over 300 MB were skipped.');
    await setMedia(files);
  };
  $('logoFile').onchange = (e) => setLogo(e.target.files[0] || null).then(() => afterChange('brand.logo'));
  $('removeLogo').onclick = () => setLogo(null).then(() => afterChange('brand.logo'));

  $('testVoice').onclick = async () => {
    const btn = $('testVoice');
    btn.disabled = true;
    try {
      btn.textContent = 'Loading voice…';
      await preloadKokoro((p) => p.total && (btn.textContent = `Downloading voice… ${Math.round((p.loaded / p.total) * 100)}%`));
      btn.textContent = 'Speaking…';
      const words = 'Hi! This is how your videos will sound.'.split(' ').map((t) => ({ text: t, weight: 1 }));
      const r = await synthesize([{ words }], { type: 'kokoro', voiceId: project.voice.voiceId, speed: project.voice.speed });
      const ac = new AudioContext();
      const src = ac.createBufferSource();
      src.buffer = r.segments[0].buffer;
      src.connect(ac.destination);
      src.start();
      src.onended = () => ac.close();
    } catch (err) {
      toast(err.message, 7000);
    } finally {
      btn.disabled = false;
      btn.textContent = '▶ Hear this voice';
    }
  };
  $('testMusic').onclick = async () => {
    const buf = await generateMusic(project.music.mood, 10, 7);
    const ac = new AudioContext();
    const src = ac.createBufferSource();
    const g = ac.createGain();
    g.gain.value = project.music.volume;
    src.buffer = buf;
    src.connect(g).connect(ac.destination);
    src.start();
    src.onended = () => ac.close();
  };
  $('loadElevenVoices').onclick = async () => {
    if (!keys.eleven) return toast('Add your ElevenLabs API key in Settings first.');
    try {
      const voices = await listElevenVoices(keys.eleven);
      fillSelect($('elevenVoice'), voices.map((v) => [v.id, v.label]), project.voice.elevenVoiceId || voices[0]?.id);
      project.voice.elevenVoiceId = $('elevenVoice').value;
      save();
    } catch (err) {
      toast(err.message, 6000);
    }
  };

  refreshKits();
  $('kitSelect').onchange = (e) => (e.target.value ? applyKit(e.target.value) : null);
  $('saveKit').onclick = async () => {
    const name = prompt('Name this brand kit (for example, the client name):');
    if (!name) return;
    const kits = store.loadKits();
    const id = 'kit_' + Date.now().toString(36);
    kits.push({ id, name: name.slice(0, 40), brand: structuredClone(project.brand) });
    store.saveKits(kits);
    if (assets.logoBlob) await store.putFile('kitlogo:' + id, assets.logoBlob);
    project.kitId = id;
    refreshKits();
    save();
    toast(`Saved brand kit "${name}"`);
  };
  $('deleteKit').onclick = async () => {
    if (!project.kitId) return toast('Pick a saved kit first.');
    if (!confirm('Delete this brand kit?')) return;
    store.saveKits(store.loadKits().filter((k) => k.id !== project.kitId));
    await store.deleteFile('kitlogo:' + project.kitId);
    project.kitId = '';
    refreshKits();
    save();
  };

  $('openSettings').onclick = () => {
    $('keyEleven').value = keys.eleven || '';
    $('keyPexels').value = keys.pexels || '';
    $('settings').showModal();
  };
  $('settings').addEventListener('close', () => {
    keys = { eleven: $('keyEleven').value.trim(), pexels: $('keyPexels').value.trim() };
    store.saveKeys(keys);
  });
  $('resetApp').onclick = async () => {
    if (!confirm('This deletes your script, settings, brand kits and uploaded files from this browser. Continue?')) return;
    for (const k of ['fs.project.v1', 'fs.brandkits.v1', 'fs.apikeys.v1']) localStorage.removeItem(k);
    for (const k of ['voice', 'music', 'media', 'logo']) await store.deleteFile(k);
    location.reload();
  };

  $('playPreview').onclick = togglePlay;
  $('scrub').oninput = (e) => {
    if (!preview) return;
    previewT = (Number(e.target.value) / 1000) * preview.timeline.duration;
    drawPreview();
  };
  $('render').onclick = startRender;
  $('cancel').onclick = () => abort?.abort();
  window.addEventListener('beforeunload', (e) => {
    if (rendering) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (store.wasInterrupted()) {
    store.markRendering(false);
    $('banner').hidden = false;
    $('banner').textContent = 'Your last export was interrupted (the page was closed or refreshed). Your script and settings are saved. Click "Make my video" to start again.';
  }

  const [voiceBlob, musicBlob, mediaBlobs, logoBlob] = await Promise.all(['voice', 'music', 'media', 'logo'].map((k) => store.getFile(k)));
  await Promise.all([
    voiceBlob && setVoiceFile(voiceBlob, false).catch(() => {}),
    musicBlob && setMusicFile(musicBlob, false).catch(() => {}),
    mediaBlobs?.length && setMedia(mediaBlobs, false),
    logoBlob && setLogo(logoBlob, false),
  ]);

  await loadFonts(FONT_BASE).catch(() => toast('Fonts failed to load; using system fonts.'));
  syncAll();
  $('saveState').textContent = store.loadProject() ? 'All changes saved' : '';
  schedulePreview();
  if (license.mode === 'licensed' && license.unlocked) {
    revalidate().then((r) => {
      if (!r.unlocked) {
        license = currentLicense();
        showLock();
        $('lockMsg').textContent = 'Your license is no longer active. Contact the seller if you think this is a mistake.';
      }
    });
  }

  window.__fs = { get project() { return project; }, results, assets, setVoiceFile, setMusicFile, setMedia, setLogo, startRender, isRendering: () => rendering };
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div class="banner">Faceless Studio could not start: ${String(err.message || err).replace(/</g, '&lt;')}. Please use the latest Chrome or Edge.</div>`);
});
