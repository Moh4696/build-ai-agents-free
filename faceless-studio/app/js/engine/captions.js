import { clamp, easeOutBack, rgba, contrastRatio, shade } from './util.js';

export const FONTS = {
  anton: { family: 'FS Anton', file: 'anton-latin-400-normal.woff2', weight: 400, label: 'Anton (bold, tall)' },
  bebas: { family: 'FS Bebas', file: 'bebas-neue-latin-400-normal.woff2', weight: 400, label: 'Bebas Neue (condensed)' },
  montserrat: { family: 'FS Montserrat', file: 'montserrat-latin-800-normal.woff2', weight: 800, label: 'Montserrat (heavy)' },
  poppins: { family: 'FS Poppins', file: 'poppins-latin-600-normal.woff2', weight: 600, label: 'Poppins (friendly)' },
  playfair: { family: 'FS Playfair', file: 'playfair-display-latin-700-normal.woff2', weight: 700, label: 'Playfair (elegant serif)' },
};

const FALLBACK = '"Noto Sans", "Segoe UI", "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

let fontsReady = null;
export function loadFonts(baseUrl) {
  if (!fontsReady) {
    fontsReady = Promise.all(
      Object.values(FONTS).map(async (f) => {
        const face = new FontFace(f.family, `url(${new URL(f.file, baseUrl).href}) format("woff2")`, { weight: String(f.weight) });
        await face.load();
        document.fonts.add(face);
      })
    ).catch((err) => {
      fontsReady = null;
      throw err;
    });
  }
  return fontsReady;
}

export function fontString(fontId, sizePx) {
  const f = FONTS[fontId] || FONTS.montserrat;
  return `${f.weight} ${Math.round(sizePx)}px "${f.family}", ${FALLBACK}`;
}

const EMOJI = [
  [/money|cash|dollar|rich|profit|income|paid|\$/i, '💰'], [/fire|hot|viral|lit/i, '🔥'], [/love|heart/i, '❤️'],
  [/time|hour|minute|clock|fast|quick/i, '⏰'], [/idea|tip|trick|hack|smart/i, '💡'], [/warn|danger|careful|mistake|never/i, '⚠️'],
  [/win|best|top|champion|success/i, '🏆'], [/grow|increase|more|up\b|boost/i, '📈'], [/secret|hidden/i, '🤫'],
  [/food|eat|cook|meal/i, '🍔'], [/travel|trip|flight/i, '✈️'], [/brain|think|mind|learn/i, '🧠'], [/health|strong|gym|fit/i, '💪'],
  [/sleep|tired|rest/i, '😴'], [/happy|fun|laugh/i, '😄'], [/phone|app|online/i, '📱'], [/home|house/i, '🏠'], [/world|earth|global/i, '🌍'],
  [/rocket|launch|start/i, '🚀'], [/yes|done|easy/i, '✅'], [/stop|no\b|don't|avoid/i, '🚫'], [/shock|crazy|insane|wow/i, '🤯'],
];
export function emojiFor(text) {
  for (const [re, e] of EMOJI) if (re.test(text)) return e;
  return null;
}

// size = fraction of the short side of the frame
export const CAPTION_STYLES = {
  'bold-pop': { label: 'Bold pop (TikTok classic)', font: 'anton', upper: true, group: 3, size: 0.12, maxLines: 2, pos: 0.58, mode: 'pop' },
  karaoke: { label: 'Karaoke highlight', font: 'montserrat', upper: false, group: 6, size: 0.085, maxLines: 3, pos: 0.6, mode: 'karaoke' },
  'one-word': { label: 'One word at a time', font: 'anton', upper: true, group: 1, size: 0.17, maxLines: 1, pos: 0.52, mode: 'pop' },
  minimal: { label: 'Minimal box', font: 'poppins', upper: false, group: 7, size: 0.06, maxLines: 3, pos: 0.7, mode: 'minimal' },
  boxed: { label: 'Highlight box', font: 'montserrat', upper: true, group: 3, size: 0.09, maxLines: 2, pos: 0.6, mode: 'boxed' },
  subtitle: { label: 'Classic subtitles', font: 'poppins', upper: false, group: 9, size: 0.052, maxLines: 2, pos: 0.78, mode: 'subtitle' },
  neon: { label: 'Neon glow', font: 'bebas', upper: true, group: 3, size: 0.14, maxLines: 2, pos: 0.56, mode: 'neon', pro: true },
  typewriter: { label: 'Typewriter', font: 'poppins', upper: false, group: 8, size: 0.068, maxLines: 3, pos: 0.58, mode: 'typewriter', pro: true },
  emoji: { label: 'Bold pop + emoji', font: 'anton', upper: true, group: 3, size: 0.115, maxLines: 2, pos: 0.6, mode: 'pop', emoji: true, pro: true },
  gradient: { label: 'Gradient fill', font: 'anton', upper: true, group: 2, size: 0.14, maxLines: 2, pos: 0.56, mode: 'gradient', pro: true },
  'shadow-stack': { label: 'Shadow stack', font: 'bebas', upper: true, group: 3, size: 0.135, maxLines: 2, pos: 0.58, mode: 'stack', pro: true },
  elegant: { label: 'Elegant serif', font: 'playfair', upper: false, group: 6, size: 0.075, maxLines: 3, pos: 0.58, mode: 'elegant', pro: true },
};

export function safeZone(W, H) {
  const ratio = W / H;
  if (ratio < 0.8) return { x: W * 0.1, y: H * 0.14, w: W * 0.8, h: H * 0.66 };
  if (ratio < 1.2) return { x: W * 0.08, y: H * 0.1, w: W * 0.84, h: H * 0.8 };
  return { x: W * 0.08, y: H * 0.1, w: W * 0.84, h: H * 0.82 };
}

export function buildChunks(item, styleId) {
  const style = CAPTION_STYLES[styleId] || CAPTION_STYLES['bold-pop'];
  const chunks = [];
  let cur = [];
  item.words.forEach((w, i) => {
    cur.push(w);
    const endsPhrase = /[.!?,;:…—]["')\]]*$/u.test(w.text);
    if (cur.length >= style.group || (endsPhrase && cur.length >= Math.min(2, style.group)) || i === item.words.length - 1) {
      chunks.push({ words: cur, start: cur[0].start });
      cur = [];
    }
  });
  chunks.forEach((c, i) => (c.end = i + 1 < chunks.length ? chunks[i + 1].start : item.end));
  return chunks;
}

function splitLongToken(ctx, token, maxWidth) {
  const parts = [];
  let cur = '';
  for (const ch of Array.from(token)) {
    if (cur && ctx.measureText(cur + ch).width > maxWidth) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function fitText(ctx, tokens, fontId, baseSize, minSize, maxWidth, maxLines, gapEm = 0) {
  let size = baseSize;
  for (let attempt = 0; attempt < 40; attempt++) {
    ctx.font = fontString(fontId, size);
    const space = ctx.measureText(' ').width + gapEm * size;
    const lines = [];
    let line = [], lineW = 0, fits = true;
    for (const tok of tokens) {
      const w = ctx.measureText(tok).width;
      if (w > maxWidth) fits = false;
      const add = line.length ? space + w : w;
      if (line.length && lineW + add > maxWidth) {
        lines.push({ tokens: line, width: lineW });
        line = [{ text: tok, w }];
        lineW = w;
      } else {
        line.push({ text: tok, w });
        lineW += add;
      }
    }
    if (line.length) lines.push({ tokens: line, width: lineW });
    if (fits && lines.length <= maxLines) return { size, lines, space };
    if (size <= minSize) {
      if (!fits) {
        const expanded = tokens.flatMap((t) => (ctx.measureText(t).width > maxWidth ? splitLongToken(ctx, t, maxWidth) : [t]));
        return fitText(ctx, expanded, fontId, size, size, maxWidth, 99, gapEm);
      }
      return { size, lines, space };
    }
    size = Math.max(minSize, size * 0.92);
  }
  return { size, lines: [], space: 0 };
}

function readableStroke(textColor) {
  return contrastRatio(textColor, '#000000') >= contrastRatio(textColor, '#ffffff') ? '#000000' : '#ffffff';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

const layoutCache = new WeakMap();

export function drawCaption(ctx, { W, H, t, chunk, styleId, brand, stats, fontOverride }) {
  const style = CAPTION_STYLES[styleId] || CAPTION_STYLES['bold-pop'];
  const fontId = fontOverride && FONTS[fontOverride] ? fontOverride : style.font;
  const unit = Math.min(W, H);
  const safe = safeZone(W, H);
  const key = `${W}x${H}:${styleId}:${fontId}`;
  let cache = layoutCache.get(chunk);
  if (!cache || cache.key !== key) {
    const tokens = chunk.words.map((w) => (style.upper ? w.text.toLocaleUpperCase() : w.text));
    const box = style.mode === 'minimal' || style.mode === 'boxed';
    const scales = ['pop', 'neon', 'stack', 'gradient'].includes(style.mode);
    const maxW = safe.w * (scales ? 0.88 : 0.98) - (box ? unit * 0.08 : 0);
    const gapEm = ['pop', 'neon', 'stack', 'gradient', 'karaoke', 'boxed', 'typewriter'].includes(style.mode) ? 0.15 : 0.04;
    cache = { key, layout: fitText(ctx, tokens, fontId, style.size * unit, style.size * unit * 0.45, maxW, style.maxLines, gapEm) };
    layoutCache.set(chunk, cache);
  }
  const { size, lines, space } = cache.layout;
  ctx.font = fontString(fontId, size);
  const lineH = size * (style.mode === 'subtitle' || style.mode === 'minimal' ? 1.3 : 1.12);
  const blockH = lines.length * lineH;
  let top = H * style.pos - blockH / 2;
  const vpad = size * 0.4;
  top = clamp(top, safe.y + vpad, safe.y + safe.h - blockH - vpad);

  const textColor = brand.textColor || '#ffffff';
  const accent = brand.accent || '#facc15';
  const stroke = readableStroke(textColor);
  const appear = clamp((t - chunk.start) / 0.14, 0, 1);
  let active = -1;
  chunk.words.forEach((w, i) => {
    if (w.start <= t) active = i;
  });

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const scaleIn = style.mode === 'pop' || style.mode === 'neon' || style.mode === 'gradient' || style.mode === 'stack' ? easeOutBack(appear) : 1;
  const alphaIn = style.mode === 'subtitle' || style.mode === 'minimal' || style.mode === 'elegant' || style.mode === 'karaoke' ? appear : 1;
  const cx = W / 2, cy = top + blockH / 2;
  ctx.translate(cx, cy);
  ctx.scale(0.85 + 0.15 * scaleIn, 0.85 + 0.15 * scaleIn);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = alphaIn;

  if (style.mode === 'minimal' || style.mode === 'subtitle') {
    const maxLineW = Math.max(...lines.map((l) => l.width));
    if (style.mode === 'minimal') {
      const pad = size * 0.55;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      roundRect(ctx, W / 2 - maxLineW / 2 - pad, top - pad * 0.6, maxLineW + pad * 2, blockH + pad * 1.2, size * 0.4);
      ctx.fill();
      record(stats, safe, W / 2 - maxLineW / 2 - pad, top - pad * 0.6, maxLineW + pad * 2, blockH + pad * 1.2);
    }
  }

  let wordIndex = 0;
  let typedChars = Infinity;
  if (style.mode === 'typewriter') {
    const total = chunk.words.reduce((a, w) => a + w.text.length + 1, 0);
    const dur = Math.max(0.3, (chunk.end - chunk.start) * 0.7);
    typedChars = Math.floor(total * clamp((t - chunk.start) / dur, 0, 1));
  }
  let charsSoFar = 0;

  lines.forEach((line, li) => {
    const y = top + lineH * (li + 0.5);
    let x = W / 2 - line.width / 2;
    record(stats, safe, x, y - size / 2, line.width, size);
    for (const tok of line.tokens) {
      const i = wordIndex++;
      const isActive = i === active;
      const spoken = i <= active;
      const wx = x + tok.w / 2;
      ctx.save();
      if (isActive && (style.mode === 'pop' || style.mode === 'neon' || style.mode === 'stack')) {
        const k = 1 + 0.12 * easeOutBack(clamp((t - chunk.words[i].start) / 0.12, 0, 1));
        ctx.translate(wx, y);
        ctx.scale(k, k);
        ctx.translate(-wx, -y);
      }
      ctx.textAlign = 'center';
      let text = tok.text;
      if (style.mode === 'typewriter') {
        const remaining = typedChars - charsSoFar;
        charsSoFar += text.length + 1;
        if (remaining <= 0) {
          ctx.restore();
          x += tok.w + space;
          continue;
        }
        if (remaining < text.length) {
          text = Array.from(text).slice(0, remaining).join('');
          ctx.textAlign = 'left';
        }
      }
      const drawX = ctx.textAlign === 'left' ? x : wx;
      switch (style.mode) {
        case 'pop':
          ctx.lineWidth = size * 0.16;
          ctx.strokeStyle = stroke;
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = isActive ? accent : textColor;
          ctx.fillText(text, drawX, y);
          break;
        case 'karaoke':
          ctx.lineWidth = size * 0.14;
          ctx.strokeStyle = stroke;
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = spoken ? accent : rgba(textColor, 0.92);
          ctx.fillText(text, drawX, y);
          break;
        case 'boxed': {
          if (isActive) {
            const pad = size * 0.18;
            ctx.fillStyle = accent;
            roundRect(ctx, x - pad, y - size * 0.62, tok.w + pad * 2, size * 1.2, size * 0.2);
            ctx.fill();
          }
          const onBox = isActive ? readableStroke(accent) === '#000000' ? '#111111' : '#ffffff' : textColor;
          if (!isActive) {
            ctx.lineWidth = size * 0.14;
            ctx.strokeStyle = stroke;
            ctx.strokeText(text, drawX, y);
          }
          ctx.fillStyle = onBox;
          ctx.fillText(text, drawX, y);
          break;
        }
        case 'minimal':
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, drawX, y);
          break;
        case 'subtitle':
          ctx.lineWidth = size * 0.12;
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, drawX, y);
          break;
        case 'neon':
          ctx.shadowColor = accent;
          ctx.shadowBlur = size * 0.35;
          ctx.lineWidth = size * 0.12;
          ctx.strokeStyle = shade(accent, -0.82);
          ctx.strokeText(text, drawX, y);
          ctx.shadowBlur = size * 0.12;
          ctx.fillStyle = isActive ? '#ffffff' : shade(accent, 0.55);
          ctx.fillText(text, drawX, y);
          break;
        case 'typewriter':
          ctx.lineWidth = size * 0.14;
          ctx.strokeStyle = stroke;
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = textColor;
          ctx.fillText(text, drawX, y);
          break;
        case 'gradient': {
          const g = ctx.createLinearGradient(x, y - size / 2, x + tok.w, y + size / 2);
          g.addColorStop(0, shade(brand.primary || '#8b5cf6', 0.35));
          g.addColorStop(1, accent);
          ctx.lineWidth = size * 0.16;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = isActive ? '#ffffff' : g;
          ctx.fillText(text, drawX, y);
          break;
        }
        case 'stack':
          ctx.fillStyle = accent;
          ctx.fillText(text, drawX + size * 0.07, y + size * 0.07);
          ctx.lineWidth = size * 0.1;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(text, drawX, y);
          ctx.fillStyle = isActive ? accent : textColor;
          if (isActive) ctx.fillStyle = '#ffffff';
          ctx.fillText(text, drawX, y);
          break;
        case 'elegant':
          ctx.shadowColor = 'rgba(0,0,0,0.75)';
          ctx.shadowBlur = size * 0.25;
          ctx.shadowOffsetY = size * 0.05;
          ctx.lineWidth = size * 0.08;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText(text, drawX, y);
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = spoken ? '#ffffff' : '#e5e5e5';
          ctx.fillText(text, drawX, y);
          break;
      }
      ctx.restore();
      x += tok.w + space;
    }
  });

  if (style.emoji) {
    const e = emojiFor(chunk.words.map((w) => w.text).join(' '));
    if (e) {
      const es = size * 1.1;
      ctx.font = `${Math.round(es)}px ${FALLBACK}`;
      ctx.textAlign = 'center';
      const ey = Math.max(safe.y + es / 2, top - es * 0.75);
      ctx.fillText(e, W / 2, ey);
    }
  }
  ctx.restore();
}

function record(stats, safe, x, y, w, h) {
  if (!stats) return;
  stats.boxes++;
  const eps = 1;
  if (x < safe.x - eps || y < safe.y - eps || x + w > safe.x + safe.w + eps || y + h > safe.y + safe.h + eps) {
    stats.overflows++;
    if (stats.overflowSamples.length < 5) stats.overflowSamples.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
}
