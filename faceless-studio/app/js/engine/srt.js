function ts(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Subtitle lines of up to ~42 characters, max 2 lines per cue. */
export function buildSrt(timeline) {
  const cues = [];
  for (const it of timeline.items) {
    let cur = [];
    const flush = (end) => {
      if (!cur.length) return;
      const text = cur.map((w) => w.text).join(' ');
      const lines = [];
      let line = '';
      for (const w of text.split(' ')) {
        if (line && (line + ' ' + w).length > 42) {
          lines.push(line);
          line = w;
        } else line = line ? line + ' ' + w : w;
      }
      if (line) lines.push(line);
      cues.push({ start: cur[0].start, end, text: lines.join('\n') });
      cur = [];
    };
    it.words.forEach((w, i) => {
      cur.push(w);
      const len = cur.map((x) => x.text).join(' ').length;
      const next = it.words[i + 1];
      if (len > 70 || /[.!?]$/.test(w.text) || !next) flush(next ? next.start : it.end);
    });
  }
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}
