import { mulberry32, rgba, shade, clamp, UserError } from './util.js';

export const BG_STYLES = {
  aurora: 'Aurora glow',
  gradient: 'Smooth gradient',
  particles: 'Floating particles',
  grid: 'Retro grid',
  bokeh: 'Bokeh lights',
  waves: 'Waves',
  solid: 'Solid brand colour',
  mix: 'Mix (changes every scene)',
};

const MIX_ORDER = ['aurora', 'particles', 'gradient', 'bokeh', 'waves', 'grid'];

function palette(brand, seed) {
  const r = mulberry32(seed);
  const p = brand.primary || '#6d28d9';
  const a = brand.accent || '#f59e0b';
  const picks = [p, a, shade(p, 0.35), shade(a, -0.3), shade(p, -0.5)];
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return { base: shade(p, -0.82), colors: picks };
}

function drawAurora(ctx, W, H, t, rand, pal) {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const fx = 0.05 + rand() * 0.12, fy = 0.04 + rand() * 0.1, ph = rand() * 6.28;
    const x = W * (0.5 + 0.4 * Math.sin(t * fx * 6.28 + ph));
    const y = H * (0.5 + 0.4 * Math.cos(t * fy * 6.28 + ph * 1.3));
    const rad = Math.max(W, H) * (0.45 + rand() * 0.25);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(pal.colors[i % pal.colors.length], 0.55));
    g.addColorStop(1, rgba(pal.colors[i % pal.colors.length], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawGradient(ctx, W, H, t, rand, pal) {
  const ang = rand() * 6.28 + t * 0.15;
  const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(ang) * R, cy - Math.sin(ang) * R, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
  g.addColorStop(0, shade(pal.colors[0], -0.35));
  g.addColorStop(0.5, shade(pal.colors[1], -0.25));
  g.addColorStop(1, shade(pal.colors[2], -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawParticles(ctx, W, H, t, rand, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.base);
  g.addColorStop(1, shade(pal.colors[0], -0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const n = 70;
  for (let i = 0; i < n; i++) {
    const x0 = rand() * W, y0 = rand() * H, sp = 20 + rand() * 60, sz = 2 + rand() * 7, ph = rand() * 6.28;
    const y = ((y0 - t * sp) % H + H) % H;
    const x = x0 + Math.sin(t * 0.8 + ph) * 25;
    ctx.fillStyle = rgba(pal.colors[i % pal.colors.length], 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + ph)));
    ctx.beginPath();
    ctx.arc(x, y, sz * (W / 1080), 0, 6.283);
    ctx.fill();
  }
}

function drawGrid(ctx, W, H, t, rand, pal) {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);
  const horizon = H * 0.42;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, pal.base);
  sky.addColorStop(1, rgba(pal.colors[1], 0.55));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  ctx.strokeStyle = rgba(pal.colors[0], 0.7);
  ctx.lineWidth = Math.max(1.5, W / 540);
  const vx = W / 2;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(vx, horizon);
    ctx.lineTo(vx + i * W * 0.18, H);
    ctx.stroke();
  }
  const off = (t * 0.6) % 1;
  for (let k = 0; k < 14; k++) {
    const z = (k + off) / 14;
    const y = horizon + (H - horizon) * z * z;
    ctx.globalAlpha = clamp(z * 1.4, 0, 1);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBokeh(ctx, W, H, t, rand, pal) {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = rand() * W + Math.sin(t * 0.3 + i) * 40;
    const y = rand() * H + Math.cos(t * 0.25 + i) * 50;
    const r = (40 + rand() * 140) * (W / 1080);
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    const c = pal.colors[i % pal.colors.length];
    g.addColorStop(0, rgba(c, 0.28));
    g.addColorStop(0.8, rgba(c, 0.12));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawWaves(ctx, W, H, t, rand, pal) {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);
  for (let L = 0; L < 5; L++) {
    const amp = H * (0.03 + rand() * 0.04), freq = 1.5 + rand() * 2, sp = 0.4 + rand() * 0.6;
    const baseY = H * (0.35 + L * 0.13);
    ctx.fillStyle = rgba(pal.colors[L % pal.colors.length], 0.22 + L * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 60) ctx.lineTo(x, baseY + Math.sin((x / W) * freq * 6.28 + t * sp + L) * amp);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSolid(ctx, W, H, t, rand, pal, brand) {
  const c = brand.primary || '#111827';
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 1.6);
  g.addColorStop(0, shade(c, 0.08));
  g.addColorStop(1, shade(c, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const DRAW = { aurora: drawAurora, gradient: drawGradient, particles: drawParticles, grid: drawGrid, bokeh: drawBokeh, waves: drawWaves, solid: drawSolid };

export function drawProcedural(ctx, W, H, style, sceneIndex, tLocal, brand, baseSeed) {
  const s = style === 'mix' ? MIX_ORDER[sceneIndex % MIX_ORDER.length] : style;
  const seed = (baseSeed + sceneIndex * 7919) >>> 0;
  const fn = DRAW[s] || drawAurora;
  fn(ctx, W, H, tLocal, mulberry32(seed), palette(brand, seed), brand);
}

export function drawCover(ctx, W, H, source, sw, sh, progress, seed) {
  const r = mulberry32(seed);
  const zoomIn = r() > 0.5;
  const p = clamp(progress, 0, 1);
  const zoom = zoomIn ? 1.05 + 0.13 * p : 1.18 - 0.13 * p;
  const scale = Math.max(W / sw, H / sh) * zoom;
  const dw = sw * scale, dh = sh * scale;
  const dirX = r() * 2 - 1, dirY = r() * 2 - 1;
  const x = (W - dw) / 2 + dirX * (dw - W) * 0.8 * (p - 0.5);
  const y = (H - dh) / 2 + dirY * (dh - H) * 0.8 * (p - 0.5);
  ctx.drawImage(source, x, y, dw, dh);
}

export async function loadMediaItem(blob) {
  if (blob.type.startsWith('video/')) {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.src = url;
    await new Promise((res, rej) => {
      el.onloadeddata = res;
      el.onerror = () => rej(new UserError('One of your background videos could not be opened. Try MP4 (H.264).'));
    });
    return { kind: 'video', el, w: el.videoWidth, h: el.videoHeight, duration: el.duration || 1 };
  }
  try {
    const bmp = await createImageBitmap(blob);
    return { kind: 'image', el: bmp, w: bmp.width, h: bmp.height };
  } catch {
    throw new UserError('One of your background images could not be opened. Use JPG, PNG or WebP.');
  }
}

export async function seekVideo(item, time) {
  const el = item.el;
  const target = item.duration > 0 ? time % item.duration : 0;
  if (Math.abs(el.currentTime - target) < 0.001 && el.readyState >= 2) return;
  await new Promise((res) => {
    const done = () => {
      el.removeEventListener('seeked', done);
      res();
    };
    el.addEventListener('seeked', done);
    el.currentTime = target;
    setTimeout(done, 2000);
  });
}

export async function fetchPexelsImages(apiKey, keywords, orientation, onWarn) {
  const cache = new Map();
  const out = [];
  for (const kw of keywords) {
    if (!cache.has(kw)) {
      cache.set(
        kw,
        (async () => {
          const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(kw)}&orientation=${orientation}&per_page=5`, {
            headers: { Authorization: apiKey },
          });
          if (res.status === 401 || res.status === 403) throw new UserError('Pexels rejected your API key. Check it in Settings.');
          if (!res.ok) throw new Error('Pexels HTTP ' + res.status);
          const json = await res.json();
          const photo = json.photos?.[0];
          if (!photo) return null;
          const img = await fetch(photo.src.large2x || photo.src.large);
          if (!img.ok) throw new Error('image HTTP ' + img.status);
          return loadMediaItem(await img.blob());
        })().catch((err) => {
          if (err instanceof UserError) throw err;
          onWarn?.(`No stock photo for "${kw}" (${err.message}). Using an animated background for that scene.`);
          return null;
        })
      );
    }
    out.push(await cache.get(kw));
  }
  return out;
}
