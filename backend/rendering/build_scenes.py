#!/usr/bin/env python3
"""
build_scenes.py — Generic, data-driven scene renderer for typographic Reels.

You do NOT edit rendering code per story. You write a CONTENT SPEC (a list of
card dicts) describing what each scene says, and this renders one 1080x1920 PNG
per card using a library of reusable card TYPES.

Two ways to drive it:
  1. Import and call render_spec(SPEC, outdir) from Python.
  2. Pass a JSON spec file:  python build_scenes.py spec.json ./scenes

------------------------------------------------------------------------------
CARD TYPES (set "type" in each card dict):

  "hook"     — opening attention grab. Fields:
                 eyebrow, kicker (small line above), headline, hero (big accent
                 number/word), subline, footer_meta (one or two lines)
  "statement"— a headline + optional supporting lines. Fields:
                 eyebrow, headline, lines (list), accent_last (bool)
  "stat"     — one or two big numbers with labels. Fields:
                 eyebrow, stats (list of {value, label}), caption
  "fact"     — label → BIG hero value → caption. The "receipt" pattern, good for
                 "what they bought / spent / earned / scored". Fields:
                 eyebrow, item_label, name, hero, caption, source
  "quote"    — a pull quote with attribution. Fields:
                 eyebrow, lead_lines (list), quote, attribution, tail_lines (list)
  "list"     — eyebrow + title + a vertical list of accent items. Fields:
                 eyebrow, title, items (list), caption
  "cta"      — closing call to action / loop. Fields:
                 eyebrow, headline, accent_headline, subline, meta

ALL fields are optional; omit what you don't need. Every card may also set:
  "theme" — override accent for that one card (rare; keep one accent normally).

------------------------------------------------------------------------------
THEME: change ACCENT / ACCENT_HI below, or pass theme={"accent":..,"accent_hi":..}
to render_spec to re-skin the whole Reel (amber default; try blue for tech,
red for hard breaking news).
"""
import os, sys, json, math, random
from PIL import Image, ImageDraw, ImageFont

# ----------------------------------------------------------------------------- palette
ACCENT    = "#b87a10"
ACCENT_HI = "#d4a017"
BG_DARK   = (8, 8, 10)
BG_GRAD   = (18, 14, 8)
WHITE     = (245, 243, 238)
MUTED     = (140, 138, 134)
DIM       = (90, 88, 84)
DANGER    = (200, 60, 40)

W, H = 1080, 1920

FONTS = {
    "serif_b": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "serif":   "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "sans_b":  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "sans":    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "mono_b":  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
}

def hex2rgb(c):
    if isinstance(c, tuple): return c
    c = c.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))

_font_cache = {}
def font(key, size):
    path = FONTS.get(key, key)
    k = (path, size)
    if k not in _font_cache:
        _font_cache[k] = ImageFont.truetype(path, size)
    return _font_cache[k]

# ----------------------------------------------------------------------------- canvas
def base_canvas():
    img = Image.new("RGB", (W, H), BG_DARK)
    px = img.load()
    cx, cy = W // 2, H // 2
    maxd = math.hypot(cx, cy)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            t = 1 - (math.hypot(x - cx, y - cy) / maxd) * 0.85
            r = int(BG_DARK[0] + (BG_GRAD[0] - BG_DARK[0]) * t)
            g = int(BG_DARK[1] + (BG_GRAD[1] - BG_DARK[1]) * t)
            b = int(BG_DARK[2] + (BG_GRAD[2] - BG_DARK[2]) * t)
            for dy in (0, 1):
                for dx in (0, 1):
                    if x + dx < W and y + dy < H:
                        px[x + dx, y + dy] = (r, g, b)
    random.seed(7)
    for _ in range(8000):
        x, y = random.randint(0, W - 1), random.randint(0, H - 1)
        n = random.randint(-12, 12)
        r, g, b = img.getpixel((x, y))
        img.putpixel((x, y), (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n))))
    return img

# ----------------------------------------------------------------------------- primitives
def filmstrip(draw, y=80, accent=None, lit_idx=None):
    accent = accent or hex2rgb(ACCENT)
    lit_idx = lit_idx or [0, 3, 6, 9, 12, 15]
    fw, fh, gap, n = 32, 56, 12, 18
    total = n * fw + (n - 1) * gap
    x0 = (W - total) // 2
    for i in range(n):
        x = x0 + i * (fw + gap)
        draw.rounded_rectangle([x, y, x + fw, y + fh], radius=4,
                               fill=accent if i in lit_idx else (28, 26, 22))

def label(draw, text, x, y, color=MUTED, size=28, key="mono_b", anchor="mm"):
    spaced = " ".join(list(text))
    draw.text((x, y), spaced, fill=color, font=font(key, size), anchor=anchor)

def rule(draw, y, w=180, x=None, accent=None):
    accent = accent or hex2rgb(ACCENT)
    if x is None: x = (W - w) // 2
    draw.rectangle([x, y, x + w, y + 4], fill=accent)

def wrap(text, font_obj, max_w, draw):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        test = (cur + " " + wd).strip()
        if draw.textbbox((0, 0), test, font=font_obj)[2] <= max_w:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = wd
    if cur: lines.append(cur)
    return lines

def multiline(draw, text, font_obj, x, y, fill, max_w=1000, line_gap=14, center=True):
    """Draw wrapped text; return y after the block. Centers horizontally if center."""
    lines = wrap(text, font_obj, max_w, draw)
    cy = y
    for ln in lines:
        bbox = draw.textbbox((0, 0), ln, font=font_obj)
        lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        cx = x - lw // 2 if center else x
        draw.text((cx, cy), ln, fill=fill, font=font_obj)
        cy += lh + line_gap
    return cy

def fit_size(draw, text, key, start, max_w=940, min_size=48):
    """Largest font size (<=start) at which text fits max_w on one line. Prevents overflow."""
    size = start
    while size > min_size:
        if draw.textbbox((0, 0), text, font=font(key, size))[2] <= max_w:
            return size
        size -= 4
    return min_size

# ----------------------------------------------------------------------------- card frame
def header(draw, eyebrow, accent):
    filmstrip(draw, 80, accent=accent)
    if eyebrow:
        label(draw, eyebrow, W // 2, 200, color=accent, size=28)
        rule(draw, 235, w=120, accent=accent)

def footer(draw, text):
    if text:
        label(draw, text, W // 2, H - 90, color=DIM, size=22)

# ----------------------------------------------------------------------------- card types
def card_hook(d, c, A, AH):
    header(d, c.get("eyebrow", "BREAKING"), A)
    if c.get("kicker"):
        multiline(d, c["kicker"], font("sans_b", 56), W // 2, 470, MUTED, 960, 12)
    if c.get("headline"):
        sz = fit_size(d, c["headline"].split("\n")[0], "serif_b", 110, 1000)
        multiline(d, c["headline"], font("serif_b", sz), W // 2, 690, WHITE, 1000, 10)
    if c.get("hero"):
        hs = fit_size(d, c["hero"], "serif_b", 200, 1000)
        d.text((W // 2, 1180), c["hero"], fill=AH, font=font("serif_b", hs), anchor="mm")
    if c.get("subline"):
        label(d, c["subline"], W // 2, 1320, color=MUTED, size=34)
    meta = c.get("footer_meta")
    if meta:
        rule(d, 1440, w=300, accent=A)
        if isinstance(meta, str): meta = [meta]
        yy = 1495
        for m in meta[:2]:
            label(d, m, W // 2, yy, color=A, size=26); yy += 55
    footer(d, c.get("footer", ""))

def card_statement(d, c, A, AH):
    header(d, c.get("eyebrow", ""), A)
    y = c.get("headline_y", 520)
    if c.get("headline"):
        sz = fit_size(d, max(c["headline"].split("\n"), key=len), "serif_b", 120, 1000)
        y = multiline(d, c["headline"], font("serif_b", sz), W // 2, y, WHITE, 1000, 10) + 40
    rule(d, y, w=180, accent=A); y += 70
    lines = c.get("lines", [])
    for i, ln in enumerate(lines):
        last = (i == len(lines) - 1)
        col = AH if (last and c.get("accent_last")) else WHITE
        key = "serif_b" if (last and c.get("accent_last")) else "serif"
        y = multiline(d, ln, font(key, 50), W // 2, y, col, 960, 14) + 18
    footer(d, c.get("footer", ""))

def card_stat(d, c, A, AH):
    header(d, c.get("eyebrow", ""), A)
    stats = c.get("stats", [])
    if len(stats) == 1:
        xs = [W // 2]
    else:
        xs = [W // 4, 3 * W // 4] if len(stats) == 2 else \
             [W * (i + 1) // (len(stats) + 1) for i in range(len(stats))]
    for x, s in zip(xs, stats):
        d.text((x, 760), str(s.get("value", "")), fill=AH, font=font("serif_b", 150), anchor="mm")
        if s.get("label"):
            multiline(d, s["label"], font("sans_b", 28), x, 880, MUTED, 460, 8)
    if c.get("caption"):
        multiline(d, c["caption"], font("serif", 46), W // 2, 1200, WHITE, 960, 14)
    footer(d, c.get("footer", ""))

def card_fact(d, c, A, AH):
    """label -> name -> BIG hero -> caption -> source. The 'receipt' pattern."""
    header(d, c.get("eyebrow", "THE RECEIPTS"), A)
    if c.get("item_label"):
        d.text((W // 2, 380), c["item_label"], fill=DIM, font=font("mono_b", 40), anchor="mm")
    if c.get("name"):
        sz = fit_size(d, max(c["name"].split("\n"), key=len), "serif_b", 100, 1000)
        multiline(d, c["name"], font("serif_b", sz), W // 2, 600, WHITE, 1000, 10)
    if c.get("hero"):
        hs = fit_size(d, c["hero"], "serif_b", 180, 1000)
        d.text((W // 2, 990), c["hero"], fill=AH, font=font("serif_b", hs), anchor="mm")
    rule(d, 1170, w=200, accent=A)
    if c.get("caption"):
        multiline(d, c["caption"], font("serif", 46), W // 2, 1330, MUTED, 920, 14)
    if c.get("source"):
        label(d, c["source"], W // 2, H - 140, color=DIM, size=22)
    footer(d, c.get("footer", ""))

def card_quote(d, c, A, AH):
    header(d, c.get("eyebrow", ""), A)
    y = 460
    for ln in c.get("lead_lines", []):
        y = multiline(d, ln, font("serif", 56), W // 2, y, WHITE, 960, 14)
    if c.get("lead_lines"):
        rule(d, y + 20, w=160, accent=A); y += 100
    if c.get("quote"):
        d.text((W // 2 - 360, y + 30), '\u201c', fill=A, font=font("serif_b", 180), anchor="lm")
        sz = fit_size(d, max(c["quote"].split("\n"), key=len), "serif_b", 64, 940, 40)
        y = multiline(d, c["quote"], font("serif_b", sz), W // 2, y + 120, WHITE, 940, 14)
    if c.get("attribution"):
        label(d, c["attribution"], W // 2, y + 30, color=MUTED, size=24); y += 90
    if c.get("tail_lines"):
        rule(d, y, w=120, accent=A); y += 70
        for i, ln in enumerate(c["tail_lines"]):
            last = (i == len(c["tail_lines"]) - 1)
            col = AH if last else WHITE
            key = "serif_b" if last else "sans_b"
            y = multiline(d, ln, font(key, 46), W // 2, y, col, 960, 12) + 14
    footer(d, c.get("footer", ""))

def card_list(d, c, A, AH):
    header(d, c.get("eyebrow", ""), A)
    y = 520
    if c.get("title"):
        sz = fit_size(d, max(c["title"].split("\n"), key=len), "serif_b", 90, 1000)
        y = multiline(d, c["title"], font("serif_b", sz), W // 2, y, WHITE, 1000, 10) + 30
    rule(d, y, w=200, accent=A); y += 90
    items = c.get("items", [])
    step = min(120, max(80, (1450 - y) // max(1, len(items))))
    sz = 72 if len(items) <= 4 else 56
    for it in items:
        d.text((W // 2, y), it, fill=AH, font=font("serif_b", sz), anchor="mm")
        y += step
    if c.get("caption"):
        label(d, c["caption"], W // 2, min(y + 20, 1520), color=MUTED, size=32)
    footer(d, c.get("footer", ""))

def card_cta(d, c, A, AH):
    header(d, c.get("eyebrow", "FOLLOW THE STORY"), A)
    y = 720
    if c.get("headline"):
        sz = fit_size(d, c["headline"], "serif_b", 150, 1000)
        y = multiline(d, c["headline"], font("serif_b", sz), W // 2, y, WHITE, 1000, 8)
    if c.get("accent_headline"):
        sz = fit_size(d, c["accent_headline"], "serif_b", 150, 1000)
        y = multiline(d, c["accent_headline"], font("serif_b", sz), W // 2, y, AH, 1000, 8)
    rule(d, y + 20, w=240, accent=A); y += 110
    if c.get("subline"):
        y = multiline(d, c["subline"], font("serif", 60), W // 2, y, WHITE, 960, 14) + 40
    d.text((W // 2, y + 60), "\u2193", fill=A, font=font("serif_b", 130), anchor="mm")
    if c.get("meta"):
        label(d, c["meta"], W // 2, y + 200, color=MUTED, size=26)
    footer(d, c.get("footer", ""))

CARD_TYPES = {
    "hook": card_hook, "statement": card_statement, "stat": card_stat,
    "fact": card_fact, "quote": card_quote, "list": card_list, "cta": card_cta,
}

# ----------------------------------------------------------------------------- driver
def render_spec(spec, outdir, theme=None):
    """spec: list of card dicts (or {"cards":[...], "theme":{...}}). Returns list of PNG paths."""
    global ACCENT, ACCENT_HI
    if isinstance(spec, dict):
        theme = theme or spec.get("theme")
        spec = spec["cards"]
    if theme:
        ACCENT = theme.get("accent", ACCENT)
        ACCENT_HI = theme.get("accent_hi", ACCENT_HI)
    os.makedirs(outdir, exist_ok=True)
    A, AH = hex2rgb(ACCENT), hex2rgb(ACCENT_HI)
    paths = []
    for i, card in enumerate(spec, 1):
        a = hex2rgb(card["theme"]["accent"]) if card.get("theme") else A
        ah = hex2rgb(card["theme"]["accent_hi"]) if card.get("theme") else AH
        img = base_canvas()
        d = ImageDraw.Draw(img)
        renderer = CARD_TYPES.get(card.get("type", "statement"), card_statement)
        renderer(d, card, a, ah)
        p = os.path.join(outdir, f"s{i:02d}.png")
        img.save(p)
        paths.append(p)
        print(f"  s{i:02d}  {card.get('type','statement'):10s} {card.get('id','')}")
    return paths

if __name__ == "__main__":
    if len(sys.argv) >= 2:
        spec_path = sys.argv[1]
        outdir = sys.argv[2] if len(sys.argv) > 2 else "./scenes"
        with open(spec_path) as f:
            spec = json.load(f)
        print(f"Rendering {spec_path} -> {outdir}")
        render_spec(spec, outdir)
        print("Done.")
    else:
        print(__doc__)
        print("\nUsage: python build_scenes.py spec.json [outdir]")
