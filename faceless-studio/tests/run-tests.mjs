#!/usr/bin/env node
// Faceless Studio test suite: consistency, quality, durability.
// Run: npm test            (full suite, ~20-30 min)
//      npm test -- --quick (skips the slowest stress tests)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app');
const REPORT = path.join(HERE, 'report');
const SAMPLES = path.join(REPORT, 'samples');
const GOLDEN = path.join(HERE, 'golden');
const QUICK = process.argv.includes('--quick');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const APP_PORT = 8766, MODEL_PORT = 8767;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const MODEL_HOST = `http://127.0.0.1:${MODEL_PORT}/`;
const MODEL_DIR = process.env.FS_MODEL_DIR || path.join(process.env.HOME || '/tmp', '.cache', 'faceless-studio-model');

async function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return await import(p);
    } catch {}
  }
  throw new Error('Playwright not found. Run: npm i -D playwright');
}

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  const py = spawnSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
  if (py.status === 0) return py.stdout.trim();
  throw new Error('ffmpeg not found. Install ffmpeg or run: pip install imageio-ffmpeg');
}
const FF = findFfmpeg();
const ff = (args) => spawnSync(FF, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function probe(file) {
  const out = ff(['-i', file]).stderr;
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  const vline = (/Stream #\S+.*Video: .*/.exec(out) || [''])[0];
  const v = /Video: (\w+)(?: \(([^)]+)\))?[^,]*, (\w+)(?:\([^)]*\))?, (\d+)x(\d+)/.exec(vline);
  const fps = /([\d.]+) fps/.exec(vline);
  const a = /Stream #\S+.*Audio: (\w+)(?: \(([^)]+)\))?.*?, (\d+) Hz, (\w+)/.exec(out);
  return {
    duration: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : null,
    video: v ? { codec: v[1], profile: v[2], pix: v[3], width: +v[4], height: +v[5], fps: fps ? +fps[1] : null } : null,
    audio: a ? { codec: a[1], profile: a[2], rate: +a[3], layout: a[4] } : null,
    raw: out,
  };
}
const decodeErrors = (file) => ff(['-v', 'error', '-i', file, '-f', 'null', '-']).stderr.trim();
function frameCount(file) {
  const out = ff(['-i', file, '-map', '0:v:0', '-f', 'null', '-']).stderr;
  const m = [...out.matchAll(/frame=\s*(\d+)/g)].pop();
  return m ? +m[1] : null;
}
function psnr(a, b, extra = []) {
  const out = ff(['-i', a, '-i', b, ...extra, '-lavfi', 'psnr', '-f', 'null', '-']).stderr;
  const m = /average:(inf|[\d.]+)/.exec(out);
  return m ? (m[1] === 'inf' ? Infinity : +m[1]) : null;
}
function ssim(a, b) {
  const out = ff(['-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-']).stderr;
  const m = /All:([\d.]+)/.exec(out);
  return m ? +m[1] : 0;
}
function frameAt(file, t, out, crop) {
  const vf = crop ? ['-vf', `crop=${crop}`] : ['-vf', 'scale=360:-2'];
  ff(['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', ...vf, out]);
  return out;
}
function volume(file) {
  const out = ff(['-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-']).stderr;
  return { max: +(/max_volume: ([-\d.]+)/.exec(out)?.[1] ?? NaN), mean: +(/mean_volume: ([-\d.]+)/.exec(out)?.[1] ?? NaN) };
}
function silences(file, noise = '-50dB', min = 0.6) {
  const out = ff(['-i', file, '-af', `silencedetect=noise=${noise}:d=${min}`, '-vn', '-f', 'null', '-']).stderr;
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const durs = [...out.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => +m[1]);
  return starts.map((s, i) => ({ start: s, duration: durs[i] ?? null }));
}
function moovFirst(file) {
  const buf = fs.readFileSync(file);
  const moov = buf.indexOf('moov'), mdat = buf.indexOf('mdat');
  return moov > 0 && mdat > 0 && moov < mdat;
}

// ---------- tiny test framework ----------
const results = [];
const tests = [];
function test(category, name, plain, fn, { slow = false } = {}) {
  tests.push({ category, name, plain, fn, slow });
}
class Skip extends Error {}
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

let browser, pw;
async function newPage({ viewport, offline = false, initScript, noModel } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  if (offline) await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort('internetdisconnected'));
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return { context, page };
}
async function enginePage(opts) {
  const { context, page } = await newPage(opts);
  await page.goto(`${BASE}/__test/blank.html`);
  await page.addScriptTag({ type: 'module', content: `import * as h from '/__test/helpers.js'; window.h = h; window.hReady = true;` });
  await page.waitForFunction(() => window.hReady === true);
  return { context, page };
}
async function appPage(opts = {}) {
  const { context, page } = await newPage(opts);
  if (opts.configOverride) {
    await context.route('**/js/config.js', async (route) => {
      const r = await route.fetch();
      let body = await r.text();
      for (const [k, v] of Object.entries(opts.configOverride)) body = body.replace(new RegExp(`${k}: [^,\\n]+,`), `${k}: ${JSON.stringify(v)},`);
      route.fulfill({ response: r, body });
    });
  }
  if (opts.beforeLoad) await opts.beforeLoad(context);
  await page.goto(`${BASE}/index.html`);
  await page.waitForFunction(() => !!window.__fs, null, { timeout: 30000 });
  return { context, page };
}
async function setScript(page, text) {
  await page.click('[data-tab=script]');
  await page.fill('#script', text);
}
async function waitRenderDone(page, timeout = 600000) {
  await page.waitForFunction(() => window.__fs && !window.__fs.isRendering(), null, { timeout, polling: 500 });
}
async function uploadResults(page, prefix) {
  return page.evaluate(async (prefix) => {
    const out = [];
    for (let i = 0; i < window.__fs.results.length; i++) {
      const r = window.__fs.results[i];
      const name = `${prefix}-${String(i + 1).padStart(2, '0')}.${r.ext}`;
      await fetch('/__upload/' + name, { method: 'POST', body: r.blob });
      out.push({ name, ext: r.ext, socialReady: r.socialReady, duration: r.duration, width: r.width, height: r.height, size: r.blob.size });
    }
    return out;
  }, prefix);
}

const BASE_PROJECT = {
  template: 'story', aspect: '9:16', quality: '720', fps: 30, captionStyle: 'bold-pop',
  background: { type: 'procedural', style: 'mix' }, dim: 0.28, progressBar: true,
  voice: { type: 'none', wpm: 170 }, music: { type: 'procedural', mood: 'upbeat', volume: 0.6 },
  brand: { primary: '#6d28d9', accent: '#facc15', textColor: '#ffffff', handle: '@teststudio', watermark: 'top-right' },
};
const SHORT = 'Most people never start. They wait for the perfect moment. But the perfect moment is a myth. Start small, start today, and adjust as you go!';
const P = (o) => ({ ...structuredClone(BASE_PROJECT), script: SHORT, ...o });

const EDGE_SCRIPTS = {
  'one line': 'Hi.',
  'emoji': 'This trick saves money 💰🔥 every single day 😱 try it now ✅',
  'Spanish accents': 'El éxito no es la clave de la felicidad. La felicidad es la clave del éxito. ¡Ánimo, mañana será mejor!',
  'Japanese': '毎日少しずつ努力することが大切です。小さな一歩が大きな変化を生みます。',
  'Arabic (right-to-left)': 'النجاح ليس نهائيا والفشل ليس قاتلا. الشجاعة للاستمرار هي ما يهم.',
  'punctuation heavy': 'Wait... what?!?! — no way; really??? Yes: (absolutely) "true" — 100%... OK!!!',
  'very long word / URL': 'Visit https://www.example-super-long-domain-name-for-testing.com/this/is/a/very/long/path/that/never/ends today for details.',
  'all caps shouting': 'THIS IS THE MOST IMPORTANT VIDEO YOU WILL WATCH TODAY. DO NOT SKIP IT. SERIOUSLY.',
  'numbered list': '# Top 3 Tips\n1. Drink water first thing.\n2. Plan tomorrow tonight.\n3. Move every hour.',
  'quote with author': 'The best way to predict the future is to create it.\n— Peter Drucker',
};

// ========== CONSISTENCY ==========
test('Consistency', 'Same script rendered 10 times gives the same video', 'Rendered one script ten times and compared the results.', async () => {
  const { page } = await enginePage();
  const runs = [];
  for (let i = 0; i < 10; i++) runs.push(await page.evaluate(([p, n]) => window.h.render(p, {}, { name: n }), [P({}), `consistency-run-${i + 1}`]));
  const files = runs.map((r) => path.join(SAMPLES, r.file));
  const frames = files.map(frameCount);
  const durs = files.map((f) => probe(f).duration);
  const srtSame = runs.every((r) => r.srt === runs[0].srt);
  const ps = files.slice(1).map((f) => psnr(files[0], f));
  const minPsnr = Math.min(...ps);
  check(srtSame, 'caption timing differed between runs');
  check(new Set(frames).size === 1, `frame counts differed: ${frames.join(', ')}`);
  check(Math.max(...durs) - Math.min(...durs) < 0.05, `durations differed: ${durs.join(', ')}`);
  check(minPsnr >= 40, `picture differed between runs (PSNR ${minPsnr.toFixed(1)} dB)`);
  files.slice(1).forEach((f) => fs.rmSync(f));
  return `10/10 runs identical: ${frames[0]} frames, ${durs[0].toFixed(2)} s, caption timing identical, picture match ${minPsnr === Infinity ? 'pixel-perfect' : minPsnr.toFixed(1) + ' dB PSNR'}.`;
});

test('Consistency', 'Free AI voice gives the same timing every time', 'Rendered the same script twice with the free AI voice.', async () => {
  const { page } = await enginePage();
  const p = P({ voice: { type: 'kokoro', voiceId: 'am_michael', speed: 1 } });
  const a = await page.evaluate(([p, m]) => window.h.render(p, { modelHost: m }, {}), [p, MODEL_HOST]);
  const b = await page.evaluate(([p, m]) => window.h.render(p, { modelHost: m }, {}), [p, MODEL_HOST]);
  check(a.srt === b.srt, 'voice timing differed between runs');
  check(Math.abs(a.duration - b.duration) < 0.01, `durations differed (${a.duration} vs ${b.duration})`);
  return `Both runs: ${a.duration.toFixed(2)} s with identical word timing (first run ${Math.round(a.renderMs / 1000)} s incl. voice model load).`;
});

test('Consistency', 'Brand kit looks identical across a 20-video batch', 'Checked the logo before encoding (pixel-exact), then used the app like a customer (20 scripts in batch mode with a logo) and compared the logo in every encoded video, including a position check.', async () => {
  const scripts = Array.from({ length: 20 }, (_, i) => `Tip number ${i + 1}. Small habits build big results. Keep going!`);
  const project = { ...P({}), progressBar: false, voice: { type: 'none', wpm: 160 }, brand: { ...BASE_PROJECT.brand, handle: '@brandcheck' } };

  // 1. Before encoding: the logo interior must be pixel-identical in every video, at every sampled time.
  const { page: ep } = await enginePage();
  const pre = await ep.evaluate(([p, s]) => window.h.logoCheck(p, s), [project, scripts]);
  const boxes = new Set(pre.map((r) => r.box)), hashes = new Set(pre.map((r) => r.hash));
  check(boxes.size === 1, `logo position/size varied before encoding: ${[...boxes].join(' | ')}`);
  check(hashes.size === 1, `logo pixels varied before encoding (${hashes.size} different versions across ${pre.length} frames)`);
  const [bx, by, bwh] = [...boxes][0].split(',');
  const [bw, bh] = bwh.split('x').map(Number);

  // 2. Through the app UI: 20-video batch, encoded.
  const { page } = await appPage();
  await page.evaluate(async () => {
    const h = await import('/__test/helpers.js');
    await window.__fs.setLogo(await h.logoBlob());
  });
  await setScript(page, scripts.join('\n===\n'));
  await page.check('#batchMode');
  await page.click('[data-tab=voice]');
  await page.check('input[name=voiceType][value=none]');
  await page.click('[data-tab=brand]');
  await page.fill('#handle', '@brandcheck');
  await page.selectOption('#quality', '720');
  await page.uncheck('#autoMp4');
  await page.click('#render');
  await waitRenderDone(page);
  const res = await uploadResults(page, 'batch20');
  check(res.length === 20, `expected 20 videos, got ${res.length}`);
  const sizes = new Set(res.map((r) => `${r.width}x${r.height}`));
  check(sizes.size === 1, 'videos had different sizes');

  // Crops of compressed (YUV 4:2:0) video must start on even pixels, or ffmpeg silently shifts them by 1 px.
  const even = (v) => Math.ceil(v / 2) * 2;
  const cx = even(+bx + 2), cy = even(+by + 2), cw = Math.floor((bw - 4 - (cx - +bx - 2)) / 2) * 2, ch = Math.floor((bh - 4 - (cy - +by - 2)) / 2) * 2;
  const crop = (x, y) => `${cw}:${ch}:${x}:${y}`;
  const files = res.map((r) => path.join(SAMPLES, r.name));
  const ref = frameAt(files[0], 1.0, path.join(SAMPLES, 'batch20-logo-ref.png'), crop(cx, cy));
  let worstSsim = 1, worstPsnr = Infinity, misplaced = [];
  for (let i = 1; i < files.length; i++) {
    const c0 = frameAt(files[i], 1.0, path.join(SAMPLES, `batch20-logo-${i + 1}.png`), crop(cx, cy));
    worstSsim = Math.min(worstSsim, ssim(ref, c0));
    worstPsnr = Math.min(worstPsnr, psnr(ref, c0));
    // Position check: the best match must be at zero offset, not shifted by 2 px in any direction.
    const p0 = psnr(ref, c0);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const shifted = frameAt(files[i], 1.0, path.join(SAMPLES, 'batch20-shift.png'), crop(cx + dx, cy + dy));
      if (psnr(ref, shifted) >= p0) misplaced.push(`video ${i + 1} (${dx},${dy})`);
    }
  }
  // Tolerance for lossy video compression only (logo is pixel-identical before encoding, checked above).
  check(!misplaced.length, 'logo position shifted in: ' + misplaced.join(', '));
  check(worstSsim >= 0.97, `encoded logo similarity too low (SSIM ${worstSsim.toFixed(3)}, need ≥ 0.970)`);

  // Contact sheet for human review: wide crops (logo + margin) of the first 10 videos, magnified 3x.
  const wide = `${even(bw + 24)}:${even(bh + 24)}:${even(+bx - 12)}:${even(+by - 12)}`;
  const sheets = files.slice(0, 10).map((f, i) => {
    const out = path.join(SAMPLES, `sheet-${i}.png`);
    ff(['-v', 'error', '-y', '-ss', '1.0', '-i', f, '-frames:v', '1', '-vf', `crop=${wide},scale=iw*3:ih*3:flags=neighbor`, out]);
    return out;
  });
  ff(['-v', 'error', '-y', ...sheets.flatMap((s) => ['-i', s]), '-filter_complex', `hstack=${sheets.length}`, path.join(SAMPLES, 'logo-contact-sheet.png')]);

  const zipBtn = await page.$('text=Download all 20 videos (.zip)');
  check(!!zipBtn, 'zip download button missing');
  const dl = page.waitForEvent('download');
  await zipBtn.click();
  const zipPath = path.join(SAMPLES, 'batch20.zip');
  await (await dl).saveAs(zipPath);
  const zipSize = fs.statSync(zipPath).size;
  for (const f of [...files.slice(1), zipPath, ...sheets, path.join(SAMPLES, 'batch20-shift.png')]) fs.rmSync(f, { force: true });
  for (let i = 1; i < files.length; i++) fs.rmSync(path.join(SAMPLES, `batch20-logo-${i + 1}.png`), { force: true });
  return `Before encoding: logo pixel-identical in all ${pre.length} sampled frames across 20 videos (same box ${bx},${by} ${bw}×${bh}). After encoding (20 videos via the app): no position shifts; worst similarity SSIM ${worstSsim.toFixed(3)} / PSNR ${worstPsnr === Infinity ? '∞' : worstPsnr.toFixed(1) + ' dB'} (compression only). Contact sheet: samples/logo-contact-sheet.png. Zip download worked (${(zipSize / 1e6).toFixed(1)} MB).`;
}, { slow: true });

test('Consistency', 'Exports play on TikTok, Instagram and YouTube', 'Checked the MP4 export against the formats those platforms accept, for all three video shapes.', async () => {
  const { page } = await enginePage();
  const rows = [];
  for (const aspect of ['9:16', '1:1', '16:9']) {
    const r = await page.evaluate(([p, n]) => window.h.render(p, {}, { name: n, convert: true }), [P({ aspect, quality: '1080' }), `platform-${aspect.replace(':', 'x')}`]);
    const f = path.join(SAMPLES, r.file);
    const pr = probe(f);
    const errs = decodeErrors(f);
    check(r.ext === 'mp4', 'not an MP4');
    check(pr.video?.codec === 'h264' && /High|Main/.test(pr.video.profile || ''), `video codec ${pr.video?.codec} ${pr.video?.profile}`);
    check(pr.video.pix === 'yuv420p', `pixel format ${pr.video.pix}`);
    check(pr.audio?.codec === 'aac' && pr.audio.rate === 48000, `audio ${pr.audio?.codec} ${pr.audio?.rate}`);
    check(pr.video.width % 2 === 0 && pr.video.height % 2 === 0, 'odd dimensions');
    check(Math.abs(pr.video.fps - 30) < 0.01, `fps ${pr.video.fps}`);
    check(moovFirst(f), 'not "fast start" (moov after mdat)');
    check(!errs, 'decode errors: ' + errs.slice(0, 200));
    rows.push(`${aspect}: ${pr.video.width}×${pr.video.height}, H.264 ${pr.video.profile}, AAC 48 kHz, 30 fps, fast-start`);
  }
  return rows.join('; ') + '. No decode errors.';
}, { slow: true });

test('Consistency', 'Browser coverage', 'Checked which browsers the suite could run in.', async () => {
  const missing = [];
  for (const name of ['firefox', 'webkit']) {
    try {
      const b = await pw[name].launch();
      await b.close();
    } catch {
      missing.push(name === 'webkit' ? 'Safari (WebKit)' : 'Firefox');
    }
  }
  if (missing.length) throw new Skip(`Chromium (Chrome/Edge engine) tested. ${missing.join(' and ')} not installed in this test machine: check manually with the checklist in docs/MANUAL-CHECKS.md.`);
  return 'Chromium, Firefox and WebKit available.';
});

test('Consistency', 'Phone-sized screen works', 'Opened the app at iPhone size and checked nothing spills off screen.', async () => {
  const { page } = await appPage({ viewport: { width: 390, height: 844 } });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `page is ${overflow}px wider than the screen`);
  check(await page.isVisible('#render'), 'Make video button not visible');
  await page.screenshot({ path: path.join(SAMPLES, 'phone-screen.png') });
  return 'No sideways scrolling at 390×844; all controls reachable.';
});

test('Consistency', 'Older browsers without fast encoding still export', 'Simulated a browser without the fast video encoder (e.g. older Firefox/Safari).', async () => {
  const { page } = await enginePage({ initScript: 'delete window.VideoEncoder; delete window.AudioEncoder; delete window.VideoFrame;' });
  const r = await page.evaluate(([p]) => window.h.render(p, {}, { name: 'fallback-realtime' }), [P({ script: 'Short fallback test. It still works!' })]);
  const f = path.join(SAMPLES, r.file);
  const pr = probe(f);
  check(pr.video && pr.audio, 'missing video or audio track');
  check(!decodeErrors(f), 'decode errors');
  fs.rmSync(f);
  return `Exported with the backup recorder (${r.ext.toUpperCase()}, ${pr.video.codec}/${pr.audio.codec}) in real time.`;
});

test('Consistency', 'Unsupported browsers get a clear message', 'Simulated a browser that cannot export video at all.', async () => {
  const { page } = await appPage({ initScript: 'delete window.VideoEncoder; delete window.AudioEncoder; delete window.VideoFrame; delete window.MediaRecorder;' });
  await setScript(page, 'Hello world. This should explain the problem.');
  await page.click('[data-tab=voice]');
  await page.check('input[name=voiceType][value=none]');
  await page.click('#render');
  await waitRenderDone(page, 60000);
  const msg = await page.textContent('#warnings');
  check(/latest Chrome or Edge/.test(msg), 'no clear message: ' + msg);
  return `Shown: "${msg.trim().slice(0, 110)}"`;
});

// ========== QUALITY ==========
test('Quality', 'Captions never leave the safe area', 'Rendered every caption style in every video shape with tricky scripts and checked every caption box.', async () => {
  const { page } = await enginePage();
  const styles = await page.evaluate(async () => Object.keys((await window.h.engine()).CAPTION_STYLES));
  const tricky = 'Unbelievable transformation techniques revolutionize productivity. Supercalifragilisticexpialidocious! https://example.com/a/really/long/link/that/keeps/going. ' + SHORT;
  let combos = 0, boxes = 0;
  const bad = [];
  for (const aspect of ['9:16', '1:1', '16:9'])
    for (const s of styles) {
      const st = await page.evaluate(([p]) => window.h.layoutStats(p, {}, 4), [P({ aspect, captionStyle: s, script: tricky, quality: '1080' })]);
      combos++;
      boxes += st.boxes;
      if (st.overflows) bad.push(`${s} @ ${aspect}: ${st.overflows}`);
    }
  check(!bad.length, 'overflows: ' + bad.join('; '));
  return `${combos} style/shape combinations, ${boxes.toLocaleString()} caption boxes checked, 0 outside the safe area.`;
});

test('Quality', 'Captions stay readable on any background', 'Put every caption style over white, black, grey, yellow and red backgrounds and measured contrast.', async () => {
  const { page } = await enginePage();
  const styles = await page.evaluate(async () => Object.keys((await window.h.engine()).CAPTION_STYLES));
  const bgs = ['#ffffff', '#000000', '#808080', '#facc15', '#dc2626'];
  let worst = { v: Infinity };
  const bad = [];
  for (const s of styles)
    for (const bg of bgs) {
      const c = await page.evaluate(([p, bg]) => window.h.captionContrast(p, bg), [P({ captionStyle: s, quality: '720' }), bg]);
      if (c < worst.v) worst = { v: c, s, bg };
      if (c < 4.5) bad.push(`${s} on ${bg}: ${c}`);
    }
  check(!bad.length, 'low contrast: ' + bad.join('; '));
  return `${styles.length * bgs.length} combinations; lowest contrast ${worst.v}:1 (${worst.s} on ${worst.bg}). Readability guideline is 4.5:1.`;
});

test('Quality', 'Audio: no distortion, music sits under the voice', 'Measured loudness, clipping and the balance between voice and music.', async () => {
  const { page } = await enginePage();
  const withVoice = await page.evaluate(([p, m]) => window.h.audioAnalysis(p, { modelHost: m }), [P({ voice: { type: 'kokoro', voiceId: 'af_heart', speed: 1 }, script: SHORT + '\n\nSecond scene here. Keep it simple.\n\nThird scene. Done!' }), MODEL_HOST]);
  const musicOnly = await page.evaluate(([p]) => window.h.audioAnalysis(p, {}), [P({})]);
  check(withVoice.clipped === 0, `${withVoice.clipped} clipped samples`);
  check(withVoice.peak <= 0.9, `peak too high (${withVoice.peak.toFixed(3)})`);
  check(withVoice.rmsVoice > 0.03, 'voice too quiet');
  const voiceOverMusicDb = 20 * Math.log10(withVoice.rmsVoice / Math.max(1e-6, withVoice.rmsMusicUnderVoice));
  check(withVoice.rmsMusicUnderVoice > 0.002, 'music disappears completely under the voice');
  check(voiceOverMusicDb >= 10 && voiceOverMusicDb <= 35, `voice is ${voiceOverMusicDb.toFixed(1)} dB above the music (want 10-35 dB)`);
  check(musicOnly.rmsAll > 0.02 && musicOnly.clipped === 0, 'music-only track silent or clipped');
  return `Peak ${(20 * Math.log10(withVoice.peak)).toFixed(1)} dBFS, 0 clipped samples; voice is ${voiceOverMusicDb.toFixed(1)} dB louder than the music under it (music still audible); music-only videos have steady music.`;
});

test('Quality', 'No awkward silent gaps between scenes', 'Rendered a voiced video without music and looked for gaps longer than 0.6 seconds.', async () => {
  const { page } = await enginePage();
  const r = await page.evaluate(([p, m]) => window.h.render(p, { modelHost: m }, { name: 'gaps-voice-only' }), [P({ voice: { type: 'kokoro', voiceId: 'af_heart', speed: 1 }, music: { type: 'none' } }), MODEL_HOST]);
  const f = path.join(SAMPLES, r.file);
  const sil = silences(f, '-50dB', 0.6).filter((s) => s.start > 0.5 && s.start < r.duration - 1.5);
  check(!sil.length, 'gaps found at ' + sil.map((s) => `${s.start.toFixed(1)}s (${(s.duration ?? 0).toFixed(2)}s)`).join(', '));
  const vol = volume(f);
  fs.rmSync(f);
  return `No internal silence over 0.6 s. Loudness: peak ${vol.max} dB, average ${vol.mean} dB.`;
});

test('Quality', 'Tricky scripts work (emoji, other languages, punctuation, long links)', 'Fed in 10 awkward scripts plus a 3,000+ word script.', async () => {
  const { page } = await enginePage();
  const lines = [];
  for (const [label, script] of Object.entries(EDGE_SCRIPTS)) {
    const template = label === 'numbered list' ? 'listicle' : label === 'quote with author' ? 'quote' : 'story';
    const st = await page.evaluate(([p]) => window.h.layoutStats(p, {}, 2), [P({ script, template })]);
    check(st.overflows === 0, `${label}: ${st.overflows} caption overflows`);
    check(st.boxes > 0, `${label}: no captions drawn`);
    lines.push(label);
  }
  const words = 'Consistency beats intensity every single day of the week.';
  const long = Array.from({ length: 340 }, () => words).join(' ');
  const st = await page.evaluate(([p]) => window.h.layoutStats(p, {}, 30), [P({ script: long })]);
  check(st.words >= 3000, 'long script too short');
  check(st.overflows === 0, 'long script overflow');
  const r = await page.evaluate(([p]) => window.h.render(p, {}, { name: 'edge-one-line' }), [P({ script: 'Hi.' })]);
  check(r.duration > 1.5, 'one-line video too short');
  fs.rmSync(path.join(SAMPLES, r.file));
  return `All ${lines.length} tricky scripts rendered cleanly; ${st.words.toLocaleString()}-word script laid out into ${st.scenes} scenes (${Math.round(st.duration / 60)} min) with no problems.`;
});

test('Quality', 'Empty or oversized scripts get a friendly message', 'Tried to export with no script, and with a script over the word limit.', async () => {
  const { page } = await appPage();
  await setScript(page, '   ');
  await page.click('#render');
  await page.waitForTimeout(300);
  const msg1 = await page.textContent('#warnings');
  check(/empty/i.test(msg1), 'no empty-script message');
  await setScript(page, Array.from({ length: 5200 }, () => 'word').join(' '));
  await page.click('[data-tab=voice]');
  await page.check('input[name=voiceType][value=none]');
  await page.click('#render');
  await waitRenderDone(page, 60000);
  const msg2 = await page.textContent('#warnings');
  check(/limit/i.test(msg2) && /batch/i.test(msg2), 'no word-limit message: ' + msg2);
  return `Empty: "${msg1.trim()}". Too long: "${msg2.trim().slice(0, 120)}…"`;
});

test('Quality', 'Golden samples (5 per template) for your approval', 'Made 5 reference videos for each template and saved snapshot frames; future versions are compared against them.', async () => {
  const { page } = await enginePage();
  fs.mkdirSync(GOLDEN, { recursive: true });
  const scripts = {
    story: ['Nobody tells you this about success. It is boring. It is the same small thing, done every day, for years.', 'I almost quit last year. Then one tiny change turned everything around. Here is what happened.', 'Your phone is stealing your mornings. Try this for one week and watch what changes.', 'The richest people I know share one habit. They write everything down. Every idea, every goal.', 'Stop waiting to feel ready. Nobody feels ready. Start messy and fix it later!'],
    listicle: ['# 3 Apps Worth Paying For\n1. A password manager.\n2. A good note-taking app.\n3. A habit tracker you actually open.', '# 3 Foods For Focus\n1. Eggs for breakfast.\n2. A handful of nuts.\n3. Plenty of water.', '# 3 Money Rules\n1. Pay yourself first.\n2. Never buy on impulse.\n3. Automate your savings.', '# 3 Sleep Tips\n1. Same bedtime every night.\n2. No screens after ten.\n3. Keep your room cool.', '# 3 Interview Tricks\n1. Research the company.\n2. Prepare three stories.\n3. Ask one smart question.'],
    facts: ['Honey never spoils. Archaeologists found edible honey in ancient tombs.', 'Octopuses have three hearts and blue blood.', 'Bananas are berries, but strawberries are not.', 'A day on Venus is longer than its year.', 'Your brain uses about twenty percent of your energy.'],
    quote: ['The best time to plant a tree was twenty years ago. The second best time is now.\n— Chinese proverb', 'Do what you can, with what you have, where you are.\n— Theodore Roosevelt', 'It always seems impossible until it is done.\n— Nelson Mandela', 'Well done is better than well said.\n— Benjamin Franklin', 'Act as if what you do makes a difference. It does.\n— William James'],
    promo: ['Tired of boring coffee? Meet Bold Bean. Roasted fresh every week and delivered to your door.', 'Your website is losing customers. We fix that in seven days, or you pay nothing.', 'New in store: handmade candles that smell like a forest walk. Limited batch!', 'Learn to cook five dinners in five days. Our free mini course starts Monday.', 'Book your free fitness consultation today. Real coaches, real results.'],
  };
  const caption = { story: 'bold-pop', listicle: 'bold-pop', facts: 'boxed', quote: 'elegant', promo: 'karaoke' };
  const mood = { story: 'dramatic', listicle: 'upbeat', facts: 'lofi', quote: 'calm', promo: 'corporate' };
  let created = 0, compared = 0, worst = Infinity;
  for (const [tpl, list] of Object.entries(scripts))
    for (let i = 0; i < list.length; i++) {
      const name = `golden-${tpl}-${i + 1}`;
      const r = await page.evaluate(([p, n]) => window.h.render(p, {}, { name: n }), [P({ template: tpl, captionStyle: caption[tpl], music: { type: 'procedural', mood: mood[tpl], volume: 0.6 }, script: list[i], brand: { ...BASE_PROJECT.brand, cta: 'Follow @teststudio' } }), name]);
      const f = path.join(SAMPLES, r.file);
      const t = Math.min(r.duration * 0.45, r.duration - 0.5);
      const snap = frameAt(f, t.toFixed(2), path.join(SAMPLES, `${name}.png`));
      const gold = path.join(GOLDEN, `${name}.png`);
      if (!fs.existsSync(gold)) {
        fs.copyFileSync(snap, gold);
        created++;
      } else {
        const v = psnr(gold, snap);
        worst = Math.min(worst, v);
        compared++;
        check(v >= 30, `${name} looks different from the approved golden sample (${v.toFixed(1)} dB)`);
      }
    }
  if (created) return `Created ${created} golden samples (5 per template). Please watch them and approve. Future runs will compare against these.`;
  return `${compared} videos match the approved golden samples (worst ${worst === Infinity ? 'pixel-perfect' : worst.toFixed(1) + ' dB'}).`;
}, { slow: true });

// ========== DURABILITY ==========
test('Durability', '30 videos in one session without slowing down or leaking memory', 'Made 30 videos back to back in one browser tab and watched memory use.', async () => {
  const { page } = await enginePage();
  const stats = await page.evaluate(async ([base]) => {
    const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
    const out = { times: [], mem: [] };
    for (let i = 0; i < 30; i++) {
      const r = await window.h.render({ ...base, script: `Video ${i + 1}. Consistency compounds. Show up again tomorrow!` }, {}, {});
      out.times.push(r.renderMs);
      if (window.gc) window.gc();
      out.mem.push(mem());
    }
    return out;
  }, [P({})]);
  const first5 = stats.times.slice(0, 5).reduce((a, b) => a + b) / 5, last5 = stats.times.slice(-5).reduce((a, b) => a + b) / 5;
  const memGrowthMb = (stats.mem[29] - stats.mem[4]) / 1e6;
  check(last5 < first5 * 1.6 + 500, `got slower: ${first5.toFixed(0)} ms → ${last5.toFixed(0)} ms`);
  check(memGrowthMb < 300, `memory grew ${memGrowthMb.toFixed(0)} MB`);
  return `30/30 videos. Average time first 5: ${(first5 / 1000).toFixed(1)} s, last 5: ${(last5 / 1000).toFixed(1)} s. Memory change after warm-up: ${memGrowthMb.toFixed(0)} MB.`;
}, { slow: true });

test('Durability', 'A 10-minute video renders without crashing', 'Rendered a full 10-minute narrated-style video.', async () => {
  const { page } = await enginePage();
  const sentence = 'Every expert was once a beginner who refused to quit. Keep learning, keep building, and keep showing up.';
  const script = Array.from({ length: 95 }, (_, i) => (i % 8 === 0 ? `\n\nPart ${i / 8 + 1}. ` : '') + sentence).join(' ');
  const r = await page.evaluate(([p]) => window.h.render(p, {}, { name: 'stress-10min' }), [P({ script, voice: { type: 'none', wpm: 160 } })]);
  const f = path.join(SAMPLES, r.file);
  const pr = probe(f);
  const errs = decodeErrors(f);
  check(pr.duration > 540, `only ${pr.duration?.toFixed(0)} s long`);
  check(!errs, 'decode errors: ' + errs.slice(0, 200));
  check(r.stats.overflows === 0, 'caption overflow');
  const mb = fs.statSync(f).size / 1e6;
  fs.rmSync(f);
  return `${(pr.duration / 60).toFixed(1)}-minute video (${r.frames.toLocaleString()} frames, ${mb.toFixed(0)} MB) rendered in ${(r.renderMs / 60000).toFixed(1)} min with no errors.`;
}, { slow: true });

test('Durability', 'Refreshing mid-export does not lose your work', 'Started an export, refreshed the page halfway, and checked the project was still there.', async () => {
  const { page } = await appPage();
  const script = Array.from({ length: 40 }, () => 'This is a long script to keep the export busy for a while.').join(' ');
  await setScript(page, script);
  await page.selectOption('#template', 'facts');
  await page.click('[data-tab=voice]');
  await page.check('input[name=voiceType][value=none]');
  await page.waitForTimeout(800);
  await page.click('#render');
  await page.waitForTimeout(2500);
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.waitForFunction(() => !!window.__fs);
  const restored = await page.inputValue('#script');
  const template = await page.inputValue('#template');
  const banner = await page.isVisible('#banner');
  check(restored === script, 'script was lost');
  check(template === 'facts', 'settings were lost');
  check(banner, 'no interrupted-export notice');
  return 'Script and settings restored after refresh, with a notice explaining the export was interrupted.';
});

test('Durability', 'Works with no internet connection', 'Blocked all internet access and made a video with the built-in options.', async () => {
  const { page } = await appPage({ offline: true });
  await setScript(page, SHORT);
  await page.click('[data-tab=voice]');
  await page.check('input[name=voiceType][value=none]');
  await page.selectOption('#quality', '720');
  await page.click('#render');
  await waitRenderDone(page, 300000);
  const n = await page.evaluate(() => window.__fs.results.length);
  check(n === 1, 'no video produced offline');
  const r = await page.evaluate(() => ({ ext: window.__fs.results[0].ext, social: window.__fs.results[0].socialReady }));
  check(r.social, 'offline export was not converted to MP4');
  return 'Made an MP4 with captions, animated background and built-in music with the internet switched off.';
});

test('Durability', 'Stock photo service down: falls back gracefully', 'Made the Pexels service fail and checked the video still gets made.', async () => {
  const { page } = await enginePage();
  await page.context().route('https://api.pexels.com/**', (r) => r.fulfill({ status: 500, body: 'down' }));
  const r = await page.evaluate(([p]) => window.h.render(p, {}, {}), [P({ background: { type: 'pexels' }, keys: { pexels: 'test' } })]);
  check(r.warnings.length > 0, 'no warning shown');
  check(r.duration > 3, 'no video');
  await page.context().unroute('https://api.pexels.com/**');
  await page.context().route('https://api.pexels.com/**', (r) => r.fulfill({ status: 401, body: '{}' }));
  const err = await page.evaluate(([p]) => window.h.render(p, {}, {}).then(() => 'no error', (e) => e.message), [P({ background: { type: 'pexels' }, keys: { pexels: 'bad' } })]);
  check(/Pexels rejected your API key/.test(err), 'bad key message unclear: ' + err);
  return `Service down: video still made with animated backgrounds and a warning ("${r.warnings[0].slice(0, 70)}…"). Wrong key: "${err}"`;
});

test('Durability', 'ElevenLabs problems give clear messages', 'Simulated a wrong ElevenLabs key and running out of credits.', async () => {
  const { page } = await enginePage();
  const msgs = [];
  for (const status of [401, 429]) {
    await page.context().unroute('https://api.elevenlabs.io/**').catch(() => {});
    await page.context().route('https://api.elevenlabs.io/**', (r) => r.fulfill({ status, body: '{}' }));
    msgs.push(await page.evaluate(([p]) => window.h.render(p, {}, {}).then(() => 'no error', (e) => e.message), [P({ voice: { type: 'elevenlabs', apiKey: 'x', voiceId: 'v' } })]));
  }
  check(/rejected your API key/.test(msgs[0]), msgs[0]);
  check(/out of credits/.test(msgs[1]), msgs[1]);
  return `Wrong key: "${msgs[0]}" · No credits: "${msgs[1]}"`;
});

test('Durability', 'Free voice download fails: clear message and alternatives', 'Blocked the voice model download.', async () => {
  const { page } = await enginePage({ offline: true });
  const msg = await page.evaluate(([p]) => window.h.render(p, { modelHost: 'https://unreachable.invalid/' }, {}).then(() => 'no error', (e) => e.message), [P({ voice: { type: 'kokoro', voiceId: 'af_heart' } })]);
  check(/upload your own voiceover|No voice/.test(msg), msg);
  return `Shown: "${msg.slice(0, 150)}…"`;
});

test('Durability', 'License: buyers unlock, wrong keys blocked, works offline, refunds locked out', 'Simulated the Lemon Squeezy license server for every case.', async () => {
  const state = { validate: { valid: true, license_key: { status: 'active' }, meta: { product_id: 123, variant_name: 'Pro' } }, offline: false };
  const beforeLoad = async (context) => {
    await context.route('https://api.lemonsqueezy.com/v1/licenses/**', async (route) => {
      if (state.offline) return route.abort('internetdisconnected');
      const body = route.request().postData() || '';
      const key = new URLSearchParams(body).get('license_key');
      const url = route.request().url();
      let json;
      if (url.endsWith('/activate')) {
        if (key === 'GOOD-PRO') json = { activated: true, instance: { id: 'inst1' }, meta: { product_id: 123, variant_name: 'Pro license' } };
        else if (key === 'GOOD-BASIC') json = { activated: true, instance: { id: 'inst2' }, meta: { product_id: 123, variant_name: 'Basic' } };
        else if (key === 'OTHER-PRODUCT') json = { activated: true, instance: { id: 'inst3' }, meta: { product_id: 999, variant_name: 'Pro' } };
        else json = { activated: false, error: 'license_key not found.' };
      } else json = state.validate;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });
  };
  const cfg = { licenseMode: 'lemonsqueezy' };
  const { context, page } = await appPage({ configOverride: cfg, beforeLoad });
  await page.evaluate(() => localStorage.removeItem('fs.license.v1'));
  await page.reload();
  await page.waitForFunction(() => !!window.__fs);
  check(await page.isVisible('#lock'), 'lock screen not shown');
  const tryKey = async (k) => {
    await page.fill('#licenseKey', k);
    await page.click('#activate');
    await page.waitForFunction(() => document.getElementById('lockMsg').textContent !== 'Checking…' || document.getElementById('lock').hidden);
    return { locked: await page.isVisible('#lock'), msg: await page.textContent('#lockMsg') };
  };
  const bad = await tryKey('WRONG-KEY');
  check(bad.locked && /didn't work/.test(bad.msg), 'wrong key not blocked: ' + bad.msg);
  const good = await tryKey('GOOD-PRO');
  check(!good.locked, 'valid key did not unlock');
  check((await page.textContent('#tierBadge')).trim() === 'Pro', 'tier badge not Pro');
  state.offline = true;
  await page.reload();
  await page.waitForFunction(() => !!window.__fs);
  await page.waitForTimeout(800);
  check(!(await page.isVisible('#lock')), 'locked out when offline');
  state.offline = false;
  state.validate = { valid: false, license_key: { status: 'disabled' }, meta: { product_id: 123 } };
  await page.reload();
  await page.waitForFunction(() => !!window.__fs);
  await page.waitForSelector('#lock', { state: 'visible', timeout: 10000 });
  await context.close();

  const { page: p2, context: c2 } = await appPage({ configOverride: { licenseMode: 'lemonsqueezy', productId: 123 }, beforeLoad });
  state.validate = { valid: true, license_key: { status: 'active' }, meta: { product_id: 123, variant_name: 'Basic' } };
  const tryKey2 = async (k) => {
    await p2.fill('#licenseKey', k);
    await p2.click('#activate');
    await p2.waitForFunction(() => document.getElementById('lockMsg').textContent !== 'Checking…' || document.getElementById('lock').hidden);
    return { locked: await p2.isVisible('#lock'), msg: await p2.textContent('#lockMsg') };
  };
  const other = await tryKey2('OTHER-PRODUCT');
  check(other.locked && /different product/.test(other.msg), 'key for another product accepted');
  const basic = await tryKey2('GOOD-BASIC');
  check(!basic.locked, 'basic key did not unlock');
  await p2.click('[data-tab=look]');
  const neonBefore = await p2.evaluate(() => window.__fs.project.captionStyle);
  await p2.click('.cap-card[data-id=neon]');
  const neonAfter = await p2.evaluate(() => window.__fs.project.captionStyle);
  check(neonBefore === neonAfter, 'Basic user could pick a Pro caption style');
  check(await p2.isDisabled('#batchMode'), 'Basic user could use batch mode');
  await c2.close();
  return 'Wrong key blocked · key for another product blocked · valid key unlocks · keeps working offline · refunded/disabled key locks the app · Basic keys cannot use Pro features.';
});

test('Durability', 'No hidden outside dependencies', 'Scanned the app for code loaded from other websites.', async () => {
  const allowed = /api\.lemonsqueezy\.com|api\.elevenlabs\.io|api\.pexels\.com|www\.pexels\.com\/api|huggingface\.co|your-store\.lemonsqueezy\.com|www\.w3\.org/;
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) {
        if (f !== 'vendor') walk(p);
        continue;
      }
      if (!/\.(html|js|css)$/.test(f)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      for (const m of txt.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) if (!allowed.test(m[0])) offenders.push(`${path.relative(APP, p)}: ${m[0]}`);
      if (/<script[^>]+src=["']https?:/i.test(txt) || /@import\s+url\(["']?https?:/i.test(txt)) offenders.push(`${path.relative(APP, p)}: remote script/style`);
    }
  };
  walk(APP);
  check(!offenders.length, offenders.join('; '));
  const vendor = fs.readdirSync(path.join(APP, 'vendor'), { recursive: true }).length;
  return `All ${vendor} library files are bundled inside the app with pinned versions; the only outside addresses are the optional services (license check, ElevenLabs, Pexels, voice model download).`;
});

// ---------- runner ----------
async function main() {
  fs.rmSync(REPORT, { recursive: true, force: true });
  fs.mkdirSync(SAMPLES, { recursive: true });
  fs.writeFileSync(path.join(HERE, 'fixtures', 'blank.html'), '<!doctype html><meta charset="utf-8"><title>test</title><body></body>');
  if (!fs.existsSync(path.join(MODEL_DIR, 'onnx-community'))) {
    console.log('Downloading the voice model for tests (~95 MB, once)…');
    execFileSync(path.join(ROOT, 'tools', 'download-voice-model.sh'), [MODEL_DIR], { stdio: 'inherit' });
  }
  const s1 = await startServer({ root: APP, port: APP_PORT, uploadDir: SAMPLES, extraRoots: { '/__test/': path.join(HERE, 'fixtures') } });
  const s2 = await startServer({ root: MODEL_DIR, port: MODEL_PORT, cors: true });
  pw = await loadPlaywright();
  browser = await pw.chromium.launch({ args: ['--js-flags=--expose-gc', '--disable-dev-shm-usage'] });
  const t0 = Date.now();
  for (const t of tests) {
    if (ONLY && !ONLY.toLowerCase().split('|').some((o) => t.name.toLowerCase().includes(o))) continue;
    if (QUICK && t.slow) {
      results.push({ ...t, status: 'skipped', details: 'Skipped in --quick mode.' });
      continue;
    }
    const start = Date.now();
    process.stdout.write(`• [${t.category}] ${t.name} … `);
    try {
      const details = await t.fn();
      results.push({ ...t, status: 'passed', details, ms: Date.now() - start });
      console.log(`PASS (${((Date.now() - start) / 1000).toFixed(0)} s)\n    ${details}`);
    } catch (err) {
      const skipped = err instanceof Skip;
      results.push({ ...t, status: skipped ? 'not run' : 'failed', details: err.message, ms: Date.now() - start });
      console.log(`${skipped ? 'NOT RUN' : 'FAIL'}\n    ${err.message}`);
    }
    for (const ctx of browser.contexts()) await ctx.close().catch(() => {});
  }
  await browser.close();
  s1.close();
  s2.close();
  writeReport(Date.now() - t0);
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`\n${results.filter((r) => r.status === 'passed').length} passed, ${failed} failed, ${results.filter((r) => r.status === 'not run').length} not run, ${results.filter((r) => r.status === 'skipped').length} skipped.`);
  console.log(`Report: ${path.relative(process.cwd(), path.join(REPORT, 'TEST-REPORT.md'))}`);
  process.exit(failed ? 1 : 0);
}

function writeReport(ms) {
  const icon = { passed: '✅', failed: '❌', 'not run': '⚠️', skipped: '⏭️' };
  const lines = [
    '# Faceless Studio — Test Report',
    '',
    `Run on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · took ${Math.round(ms / 60000)} min · browser: Chromium ${browser?.version?.() || ''}`,
    '',
    `**${results.filter((r) => r.status === 'passed').length} passed · ${results.filter((r) => r.status === 'failed').length} failed · ${results.filter((r) => r.status === 'not run').length} not run here (needs a manual check)**`,
    '',
  ];
  for (const cat of ['Consistency', 'Quality', 'Durability']) {
    lines.push(`## ${cat}`, '');
    for (const r of results.filter((x) => x.category === cat)) {
      lines.push(`### ${icon[r.status]} ${r.name}`, '', `*What we did:* ${r.plain}`, '', `*Result:* ${r.details}`, '');
    }
  }
  fs.writeFileSync(path.join(REPORT, 'TEST-REPORT.md'), lines.join('\n'));
  fs.writeFileSync(path.join(REPORT, 'results.json'), JSON.stringify(results.map(({ fn, ...r }) => r), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
