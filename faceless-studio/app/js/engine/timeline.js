const LEAD = 0.35;
const GAP = 0.25;
const TAIL = 0.9;
const MIN_TITLE = 1.8;
const END_CARD = 2.6;

function distributeWords(words, start, duration) {
  const total = words.reduce((a, w) => a + w.weight, 0) || 1;
  const s0 = start + duration * 0.03;
  const span = duration * 0.94;
  let acc = 0;
  return words.map((w) => {
    const ws = s0 + (acc / total) * span;
    acc += w.weight;
    return { text: w.text, start: ws, end: s0 + (acc / total) * span };
  });
}

/**
 * items: [{ kind: 'title'|'scene', words, number?, keyword?, sceneIndex? }]
 * voice: result of synthesize()
 */
export function buildTimeline(items, voice, { template, attribution, brand } = {}) {
  const uploaded = !!voice.fullBuffer;
  const gap = uploaded ? 0 : GAP;
  let t = LEAD;
  const out = [];
  const clips = [];

  if (uploaded) clips.push({ buffer: voice.fullBuffer, start: LEAD });

  items.forEach((item, i) => {
    const v = voice.segments[i];
    let dur = v.duration;
    if (item.kind === 'title' && !uploaded) dur = Math.max(MIN_TITLE, dur);
    const words = v.wordTimes
      ? item.words.map((w, wi) => ({ text: w.text, start: t + v.wordTimes[wi].start, end: t + v.wordTimes[wi].end }))
      : distributeWords(item.words, t, v.duration);
    if (v.buffer) clips.push({ buffer: v.buffer, start: t });
    out.push({ ...item, start: t, end: t + dur, words });
    t += dur + gap;
  });

  const lastEnd = out.length ? out[out.length - 1].end : LEAD;
  let endCard = null;
  const wantsEndCard = template === 'promo' || (template === 'quote' && attribution) || (brand?.handle && template !== 'story');
  let duration = lastEnd + TAIL;
  if (wantsEndCard) {
    endCard = { start: lastEnd + 0.3, end: lastEnd + 0.3 + END_CARD };
    duration = endCard.end + 0.2;
  }
  // Extend each scene to the next scene's start so the background never goes blank.
  for (let i = 0; i < out.length; i++) out[i].visualEnd = i + 1 < out.length ? out[i + 1].start : endCard ? endCard.start : duration;

  return { duration, items: out, voiceClips: clips, endCard };
}

export function itemAt(timeline, t) {
  const items = timeline.items;
  let lo = 0, hi = items.length - 1, found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
