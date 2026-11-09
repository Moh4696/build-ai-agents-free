import { UserError } from './util.js';

export const MAX_WORDS = 5000;
const MAX_SCENE_WORDS = 30;

const STOPWORDS = new Set(
  ('a an the and or but if then so of to in on at by for with from up down out over under about into ' +
    'is are was were be been being am do does did have has had it its this that these those there here ' +
    'i you he she we they me him her us them my your his our their what which who whom when where why how ' +
    'not no yes can could will would should may might must just very really more most less much many ' +
    'some any all each every one two three than too also only even still ever never always as like get got')
    .split(' ')
);

export function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text) {
  const parts = text.split(/(?<=[.!?…。！？])\s+/u).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

function chunkBySentences(text) {
  const sentences = splitSentences(text);
  const out = [];
  let cur = [];
  let count = 0;
  for (const s of sentences) {
    const n = s.split(/\s+/).length;
    if (count > 0 && count + n > MAX_SCENE_WORDS) {
      out.push(cur.join(' '));
      cur = [];
      count = 0;
    }
    if (n > MAX_SCENE_WORDS) {
      const words = s.split(/\s+/);
      for (let i = 0; i < words.length; i += MAX_SCENE_WORDS) out.push(words.slice(i, i + MAX_SCENE_WORDS).join(' '));
      continue;
    }
    cur.push(s);
    count += n;
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export function wordWeight(word) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  let w = 1 + Math.max(letters, 1) * 0.35;
  if (/[.!?…]["')\]]*$/u.test(word)) w += 2.2;
  else if (/[,;:—-]["')\]]*$/u.test(word)) w += 1.1;
  return w;
}

function toWords(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, weight: wordWeight(t) }));
}

export function keywordFor(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!words.length) return 'abstract';
  return words.reduce((best, w) => (w.length > best.length ? w : best), words[0]);
}

const LIST_RE = /^(\d{1,3})[.)]\s+(.*)$/;

export function parseScript(raw, { template = 'story' } = {}) {
  const text = cleanText(raw);
  if (!text) throw new UserError('Your script is empty. Paste or type a script first.');
  const totalWords = text.split(/\s+/).filter(Boolean).length;
  if (totalWords > MAX_WORDS) {
    throw new UserError(`Your script has ${totalWords} words. The limit is ${MAX_WORDS} per video. Split it into several videos (use batch mode).`);
  }

  const lines = text.split('\n');
  let title = null;
  if (lines[0].startsWith('#')) {
    title = lines.shift().replace(/^#+\s*/, '').trim() || null;
  }

  let attribution = null;
  if (template === 'quote' && lines.length > 1) {
    const last = lines[lines.length - 1];
    if (/^[—–~-]\s*\S/.test(last)) {
      attribution = last.replace(/^[—–~-]\s*/, '');
      lines.pop();
    }
  }

  const body = lines.join('\n').trim();
  const rawScenes = [];
  const listLines = body.split('\n').filter((l) => LIST_RE.test(l));

  if (listLines.length >= 2) {
    let intro = [];
    let current = null;
    for (const line of body.split('\n')) {
      const m = LIST_RE.exec(line);
      if (m) {
        if (current) rawScenes.push(current);
        else if (intro.length) rawScenes.push({ text: intro.join(' ') });
        current = { text: m[2], number: Number(m[1]) };
      } else if (line) {
        if (current) current.text += ' ' + line;
        else intro.push(line);
      } else if (current) {
        rawScenes.push(current);
        current = null;
      }
    }
    if (current) rawScenes.push(current);
    else if (intro.length && !rawScenes.length) rawScenes.push({ text: intro.join(' ') });
  } else {
    const paragraphs = body.split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
    for (const p of paragraphs) for (const chunk of chunkBySentences(p)) rawScenes.push({ text: chunk });
  }

  if (!rawScenes.length && title) rawScenes.push({ text: title });
  if (!rawScenes.length) throw new UserError('Could not find any words to turn into a video.');

  const scenes = [];
  for (const s of rawScenes) {
    const chunks = s.number != null ? chunkBySentences(s.text) : [s.text];
    chunks.forEach((chunk, ci) => {
      scenes.push({ text: chunk, number: ci === 0 ? s.number : undefined, words: toWords(chunk), keyword: keywordFor(chunk) });
    });
  }
  scenes.forEach((s, i) => (s.index = i));
  return { title, attribution, scenes, wordCount: totalWords };
}

export function splitBatch(raw) {
  return cleanText(raw)
    .split(/^\s*={3,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}
