import { drawProcedural, drawCover, seekVideo } from './backgrounds.js';
import { drawCaption, buildChunks, fitText, fontString, safeZone } from './captions.js';
import { itemAt } from './timeline.js';
import { clamp, easeOutBack, rgba, shade } from './util.js';

const XFADE = 0.45;

export const TEMPLATES = {
  story: { label: 'Story / narration', defaultCaption: 'bold-pop' },
  listicle: { label: 'Top list (numbered)', defaultCaption: 'bold-pop' },
  facts: { label: 'Did-you-know facts', defaultCaption: 'boxed' },
  quote: { label: 'Quote / motivation', defaultCaption: 'elegant', pro: true },
  promo: { label: 'Product / business promo', defaultCaption: 'karaoke', pro: true },
};

export class Renderer {
  constructor({ W, H, project, timeline, media = null, logo = null, seed = 1 }) {
    this.W = W;
    this.H = H;
    this.p = project;
    this.tl = timeline;
    this.media = media;
    this.logo = logo;
    this.seed = seed;
    this.stats = { frames: 0, boxes: 0, overflows: 0, overflowSamples: [] };
    this.chunks = timeline.items.map((it) => (it.kind === 'title' ? [] : buildChunks(it, project.captionStyle)));
    let factNo = 0;
    this.factNumbers = timeline.items.map((it) => (it.kind === 'scene' ? ++factNo : 0));
  }

  mediaFor(index) {
    if (!this.media || !this.media.length) return null;
    return this.media[index % this.media.length] || null;
  }

  async prepare(t) {
    const idx = itemAt(this.tl, t);
    for (const i of [idx - 1, idx]) {
      if (i < 0) continue;
      const m = this.mediaFor(i);
      if (m?.kind === 'video') await seekVideo(m, Math.max(0, t - this.tl.items[i].start));
    }
  }

  drawBackground(ctx, i, t) {
    const it = this.tl.items[i];
    const local = Math.max(0, t - it.start);
    const m = this.mediaFor(i);
    if (m) {
      const span = Math.max(0.5, it.visualEnd - it.start + XFADE);
      drawCover(ctx, this.W, this.H, m.el, m.w, m.h, local / span, this.seed + i * 131);
    } else {
      drawProcedural(ctx, this.W, this.H, this.p.background?.style || 'aurora', i, local + i * 3.1, this.p.brand || {}, this.seed);
    }
  }

  draw(ctx, t) {
    const { W, H } = this;
    const brand = this.p.brand || {};
    const items = this.tl.items;
    const idx = itemAt(this.tl, t);
    const it = items[idx];
    this.stats.frames++;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (idx > 0 && t < it.start + XFADE) {
      this.drawBackground(ctx, idx - 1, t);
      ctx.globalAlpha = clamp((t - it.start) / XFADE, 0, 1);
      this.drawBackground(ctx, idx, t);
      ctx.globalAlpha = 1;
    } else {
      this.drawBackground(ctx, idx, t);
    }

    const dim = this.p.dim ?? 0.28;
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 1.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    const inEnd = this.tl.endCard && t >= this.tl.endCard.start;
    if (!inEnd) {
      if (it.kind === 'title') this.drawTitle(ctx, it, t);
      else {
        this.drawDecor(ctx, idx, it, t);
        const chunks = this.chunks[idx];
        let chunk = null;
        for (const c of chunks) if (c.start <= t && t < c.end) chunk = c;
        if (!chunk && chunks.length && t >= chunks[chunks.length - 1].start && t < it.visualEnd - 0.05) chunk = chunks[chunks.length - 1];
        if (chunk) drawCaption(ctx, { W, H, t, chunk, styleId: this.p.captionStyle, brand, stats: this.stats, fontOverride: brand.font });
      }
    } else {
      this.drawEndCard(ctx, t);
    }

    if (this.p.progressBar) {
      const h = Math.max(6, H * 0.006);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, 0, W, h);
      ctx.fillStyle = brand.accent || '#facc15';
      ctx.fillRect(0, 0, W * clamp(t / this.tl.duration, 0, 1), h);
    }
    this.drawWatermark(ctx);
    ctx.restore();
  }

  drawTitle(ctx, it, t) {
    const { W, H } = this;
    const brand = this.p.brand || {};
    const safe = safeZone(W, H);
    const unit = Math.min(W, H);
    const a = easeOutBack(clamp((t - it.start) / 0.35, 0, 1));
    const fontId = brand.font || 'anton';
    const tokens = it.words.map((w) => w.text.toLocaleUpperCase());
    const L = fitText(ctx, tokens, fontId, unit * 0.13, unit * 0.06, safe.w * 0.9, 4, 0.15);
    const lineH = L.size * 1.08;
    const top = H * 0.45 - (L.lines.length * lineH) / 2;
    ctx.save();
    ctx.translate(W / 2, H * 0.45);
    ctx.scale(0.8 + 0.2 * a, 0.8 + 0.2 * a);
    ctx.translate(-W / 2, -H * 0.45);
    ctx.font = fontString(fontId, L.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    L.lines.forEach((line, i) => {
      const y = top + lineH * (i + 0.5);
      const text = line.tokens.map((x) => x.text).join(' ');
      ctx.lineWidth = L.size * 0.16;
      ctx.strokeStyle = '#000';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = brand.textColor || '#fff';
      ctx.fillText(text, W / 2, y);
      this.stats.boxes++;
    });
    const barW = Math.min(safe.w * 0.4, unit * 0.35) * clamp((t - it.start) / 0.6, 0, 1);
    ctx.fillStyle = brand.accent || '#facc15';
    ctx.fillRect(W / 2 - barW / 2, top + L.lines.length * lineH + unit * 0.03, barW, unit * 0.014);
    ctx.restore();
  }

  drawDecor(ctx, idx, it, t) {
    const { W, H } = this;
    const brand = this.p.brand || {};
    const unit = Math.min(W, H);
    const safe = safeZone(W, H);
    const tpl = this.p.template;
    const a = clamp((t - it.start) / 0.3, 0, 1);

    if (tpl === 'listicle' && it.number != null) {
      const r = unit * 0.085 * easeOutBack(a);
      const cx = W / 2, cy = safe.y + unit * 0.11;
      ctx.fillStyle = brand.accent || '#facc15';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, r), 0, 6.283);
      ctx.fill();
      ctx.lineWidth = unit * 0.008;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.font = fontString('anton', unit * 0.09);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#111';
      ctx.globalAlpha = a;
      ctx.fillText(String(it.number), cx, cy + unit * 0.004);
      ctx.globalAlpha = 1;
    }
    if (tpl === 'facts') {
      const label = `FACT #${this.factNumbers[idx]}`;
      ctx.font = fontString('montserrat', unit * 0.045);
      const w = ctx.measureText(label).width + unit * 0.06;
      const h = unit * 0.075;
      const x = W / 2 - w / 2, y = safe.y + unit * 0.06;
      ctx.globalAlpha = a;
      ctx.fillStyle = brand.accent || '#facc15';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, y + h / 2);
      ctx.globalAlpha = 1;
    }
    if (tpl === 'quote') {
      ctx.font = fontString('playfair', unit * 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(brand.accent || '#facc15', 0.22 * a);
      ctx.fillText('“', W / 2, safe.y + unit * 0.2);
    }
  }

  drawEndCard(ctx, t) {
    const { W, H } = this;
    const brand = this.p.brand || {};
    const unit = Math.min(W, H);
    const safe = safeZone(W, H);
    const ec = this.tl.endCard;
    const a = clamp((t - ec.start) / 0.4, 0, 1);
    ctx.fillStyle = rgba(shade(brand.primary || '#111827', -0.6), 0.75 * a);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    let y = H * 0.42;
    if (this.logo) {
      const s = unit * 0.26;
      const k = s / Math.max(this.logo.width, this.logo.height);
      ctx.drawImage(this.logo, W / 2 - (this.logo.width * k) / 2, y - this.logo.height * k - unit * 0.04, this.logo.width * k, this.logo.height * k);
    }
    const tpl = this.p.template;
    const main = tpl === 'quote' && this.p.attribution ? '— ' + this.p.attribution : brand.cta || (tpl === 'promo' ? 'Link in bio' : 'Follow for more');
    const L = fitText(ctx, main.split(/\s+/), tpl === 'quote' ? 'playfair' : 'montserrat', unit * 0.08, unit * 0.04, safe.w, 3);
    ctx.font = fontString(tpl === 'quote' ? 'playfair' : 'montserrat', L.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    L.lines.forEach((line, i) => {
      ctx.fillStyle = '#fff';
      ctx.fillText(line.tokens.map((x) => x.text).join(' '), W / 2, y + i * L.size * 1.2);
    });
    y += L.lines.length * L.size * 1.2 + unit * 0.03;
    if (brand.handle) {
      ctx.font = fontString('poppins', unit * 0.05);
      ctx.fillStyle = brand.accent || '#facc15';
      ctx.fillText(brand.handle, W / 2, y);
    }
    ctx.globalAlpha = 1;
  }

  drawWatermark(ctx) {
    const brand = this.p.brand || {};
    if (!this.logo && !brand.handle) return;
    if (brand.watermark === 'off') return;
    const { W, H } = this;
    const unit = Math.min(W, H);
    const margin = unit * 0.045;
    const pos = brand.watermark || 'top-right';
    const right = pos.endsWith('right');
    const bottom = pos.startsWith('bottom');
    ctx.save();
    // Fully opaque and on whole pixels so a brand logo renders identically over any background.
    let x = Math.round(right ? W - margin : margin);
    let y = Math.round(bottom ? H - margin : margin + (this.p.progressBar ? unit * 0.02 : 0));
    if (this.logo) {
      const s = unit * 0.11;
      const k = s / Math.max(this.logo.width, this.logo.height);
      const w = Math.round(this.logo.width * k), h = Math.round(this.logo.height * k);
      const lx = right ? x - w : x, ly = bottom ? y - h : y;
      ctx.drawImage(this.logo, lx, ly, w, h);
      this.stats.logoBox = { x: lx, y: ly, w, h };
      y = bottom ? y - h - unit * 0.01 : y + h + unit * 0.01;
    }
    if (brand.handle && brand.watermarkHandle !== false) {
      ctx.font = fontString('poppins', unit * 0.032);
      ctx.textAlign = right ? 'right' : 'left';
      ctx.textBaseline = bottom ? 'bottom' : 'top';
      ctx.lineWidth = unit * 0.006;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(brand.handle, x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(brand.handle, x, y);
    }
    ctx.restore();
  }
}
