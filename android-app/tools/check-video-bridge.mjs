#!/usr/bin/env node
// Checks the Android video bridge in desktop Chromium before it goes into the APK.
// It builds the same asset folder Gradle puts in the APK, opens bridge.html and makes real videos.
//
//   node android-app/tools/check-video-bridge.mjs --out ./bridge-check [--voice bm_george] [--quality 720]
//
// The voice model downloads from Hugging Face on first use, exactly as on a phone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../faceless-studio/tests/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);

const out = path.resolve(arg('--out', 'bridge-check'));
const voices = arg('--voice', 'none,bm_george').split(',');
const quality = arg('--quality', '720');
const script = arg('--script', 'Radiators cold at the top but warm at the bottom? That usually means trapped air. Bleeding them takes a few minutes and can make your whole home feel warmer.');

// Same layout as the Gradle task: studio/{js,vendor,fonts} + bridge files.
const site = path.join(out, 'site');
fs.rmSync(site, { recursive: true, force: true });
for (const d of ['js', 'vendor', 'fonts']) fs.cpSync(path.join(REPO, 'faceless-studio/app', d), path.join(site, d), { recursive: true });
for (const f of ['bridge.html', 'bridge.js']) fs.copyFileSync(path.join(REPO, 'android-app/app/src/main/studio', f), path.join(site, f));

const port = 9300 + Math.floor(Math.random() * 100);
const server = await startServer({ root: site, port });
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${port}/bridge.html`);
await page.waitForFunction(() => window.videoBridgeReady === true);

let failed = 0;
for (const voiceId of voices) {
  const t0 = Date.now();
  await page.evaluate(() => { window.__result = null; window.__done = false; window.__error = null; });
  await page.evaluate((o) => window.makeVideo(JSON.stringify(o)), { script, voiceId, mood: 'calm', quality });
  await page.waitForFunction(() => window.__done || window.__error, null, { timeout: 15 * 60 * 1000 });
  const r = await page.evaluate(() => ({ error: window.__error, result: window.__result }));
  if (r.error) {
    failed++;
    console.log(`✗ ${voiceId}: ${r.error}`);
    continue;
  }
  const bytes = Buffer.concat(r.result.chunks.map((c) => Buffer.from(c, 'base64')));
  const file = path.join(out, `bridge-${voiceId}.${r.result.ext}`);
  fs.writeFileSync(file, bytes);
  const ok = bytes.length === r.result.size;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${voiceId}: ${file} ${bytes.length} bytes (expected ${r.result.size}), ` +
    `${r.result.meta.duration.toFixed(1)} s video, ${r.result.meta.codecs.video} / ${r.result.meta.codecs.audio}, ` +
    `${Math.round((Date.now() - t0) / 1000)} s to make`);
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
