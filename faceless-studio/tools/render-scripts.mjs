#!/usr/bin/env node
// Renders many videos from a scripts file, using the real Faceless Studio engine in headless Chromium.
//
//   node tools/render-scripts.mjs validation/service/trades-scripts.md --out ./out --only R1,P2
//
// Markdown format: each video is a heading "### ID: Title", an optional settings comment, then a ```text block:
//   ### R1: Three signs your roof needs attention
//   <!-- voice: bm_george, template: listicle, mood: calm -->
//   ```text
//   ...script...
//   ```
// Options: --out DIR (default ./renders) --only ID,ID --brand brand.json --quality 720|1080 --no-mp4
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = process.env.FS_MODEL_DIR || path.join(process.env.HOME || '/tmp', '.cache', 'faceless-studio-model');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

export function parseScriptsMarkdown(md) {
  const videos = [];
  const re = /^###\s+([A-Za-z0-9_-]+):\s*(.+)$/gm;
  const heads = [...md.matchAll(re)];
  heads.forEach((h, i) => {
    const body = md.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : md.length);
    const block = /```text\n([\s\S]*?)```/.exec(body);
    if (!block) return;
    const settings = {};
    const comment = /<!--([\s\S]*?)-->/.exec(body.slice(0, block.index));
    if (comment) for (const kv of comment[1].split(',')) {
      const [k, v] = kv.split(':').map((s) => s && s.trim());
      if (k && v) settings[k] = v;
    }
    videos.push({ id: h[1], title: h[2].trim(), script: block[1].trim(), settings });
  });
  return videos;
}

function projectFor(video, base) {
  const s = video.settings;
  const p = structuredClone(base);
  if (s.template) p.template = s.template;
  if (s.caption) p.captionStyle = s.caption;
  if (s.background) p.background = { type: 'procedural', style: s.background };
  if (s.voice === 'none') p.voice = { type: 'none', wpm: 160 };
  else if (s.voice) p.voice = { ...p.voice, type: 'kokoro', voiceId: s.voice };
  if (s.speed) p.voice.speed = Number(s.speed);
  if (s.mood === 'none') p.music = { type: 'none' };
  else if (s.mood) p.music = { ...p.music, type: 'procedural', mood: s.mood };
  if (s.volume) p.music.volume = Number(s.volume);
  p.script = video.script;
  return p;
}

async function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return await import(p);
    } catch {}
  }
  throw new Error('Playwright not found. Run: npm i -D playwright');
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) {
    console.error('Usage: node tools/render-scripts.mjs <scripts.md> [--out DIR] [--only ID,ID] [--brand brand.json] [--quality 720|1080] [--no-mp4]');
    process.exit(1);
  }
  const out = path.resolve(arg('--out', 'renders'));
  const only = (arg('--only', '') || '').split(',').filter(Boolean);
  const convert = !process.argv.includes('--no-mp4');
  let videos = parseScriptsMarkdown(fs.readFileSync(input, 'utf8'));
  if (only.length) videos = videos.filter((v) => only.includes(v.id));
  if (!videos.length) throw new Error('No scripts found (check the "### ID: Title" + ```text format).');

  const base = {
    template: 'story', aspect: '9:16', quality: arg('--quality', '1080'), fps: 30, captionStyle: 'bold-pop',
    background: { type: 'procedural', style: 'mix' }, dim: 0.28, progressBar: false,
    voice: { type: 'kokoro', voiceId: 'bm_george', speed: 1 }, music: { type: 'procedural', mood: 'calm', volume: 0.5 },
    brand: { primary: '#1d4ed8', accent: '#facc15', textColor: '#ffffff', handle: '', cta: '', watermark: 'top-right' },
  };
  const brandFile = arg('--brand');
  if (brandFile) Object.assign(base.brand, JSON.parse(fs.readFileSync(brandFile, 'utf8')));

  if (!fs.existsSync(path.join(MODEL_DIR, 'onnx-community'))) {
    console.log('Downloading the voice model (~95 MB, once)…');
    execFileSync(path.join(ROOT, 'tools', 'download-voice-model.sh'), [MODEL_DIR], { stdio: 'inherit' });
  }
  fs.mkdirSync(out, { recursive: true });
  const fixtures = path.join(ROOT, 'tests', 'fixtures');
  fs.writeFileSync(path.join(fixtures, 'blank.html'), '<!doctype html><meta charset="utf-8"><title>render</title><body></body>');
  const appPort = 8900 + Math.floor(Math.random() * 50), modelPort = appPort + 50;
  const s1 = await startServer({ root: path.join(ROOT, 'app'), port: appPort, uploadDir: out, extraRoots: { '/__test/': fixtures } });
  const s2 = await startServer({ root: MODEL_DIR, port: modelPort, cors: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${appPort}/__test/blank.html`);
  await page.addScriptTag({ type: 'module', content: `import * as h from '/__test/helpers.js'; window.h = h; window.hReady = true;` });
  await page.waitForFunction(() => window.hReady === true);

  const summary = [];
  for (const v of videos) {
    const t0 = Date.now();
    process.stdout.write(`• ${v.id} ${v.title} … `);
    try {
      const r = await page.evaluate(
        ([p, host, name, conv]) => window.h.render(p, { modelHost: host }, { name, convert: conv }),
        [projectFor(v, base), `http://127.0.0.1:${modelPort}/`, v.id, convert]
      );
      fs.writeFileSync(path.join(out, `${v.id}.srt`), r.srt);
      summary.push({ id: v.id, title: v.title, file: r.file, seconds: +r.duration.toFixed(1), socialReady: r.socialReady, overflows: r.stats.overflows, warnings: r.warnings });
      console.log(`${r.file} (${r.duration.toFixed(1)} s, ${Math.round((Date.now() - t0) / 1000)} s to make)`);
    } catch (err) {
      summary.push({ id: v.id, title: v.title, error: String(err.message || err) });
      console.log('FAILED: ' + (err.message || err));
    }
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ input, videos: summary }, null, 2));
  await browser.close();
  s1.close();
  s2.close();
  const failed = summary.filter((s) => s.error).length;
  console.log(`\n${summary.length - failed}/${summary.length} videos made in ${out}`);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e.message || e);
  process.exit(2);
});
