# Faceless Studio

Turn a script into a captioned, voiced, branded faceless video (TikTok, Reels, Shorts, YouTube) entirely in the browser. There's no server, nothing to pay for each month, and nothing to maintain.

**Start here:** [`docs/LAUNCH-GUIDE.md`](docs/LAUNCH-GUIDE.md) (no coding needed).

| Folder | What it is |
|---|---|
| `app/` | The app. Deploy this folder to Vercel or Netlify as a static site. |
| `app/js/config.js` | The only file you edit: license mode, store IDs, buy link. |
| `landing/` | Sales page for selling the tool. |
| `docs/LAUNCH-GUIDE.md` | Put it online, connect Lemon Squeezy, start selling. |
| `docs/SERVICE-KIT.md` | Sell done-for-you videos: packages, outreach messages, onboarding form. |
| `docs/MANUAL-CHECKS.md` | 10-minute Firefox/Safari checklist before each release. |
| `tests/` | Automated consistency, quality and durability tests (`npm test`). |
| `tools/` | Rebuild the bundled libraries, or download the voice model for self-hosting. |

## Features
- Script → scenes → voice → word-by-word captions → background → music → MP4, all in the browser
- Templates: story, top list, facts, quote, promo
- 12 caption styles; 9:16, 1:1 and 16:9 at 720p or 1080p
- Voices: free in-browser AI voice (Kokoro, 12 English voices), ElevenLabs (buyer's key), upload, or none
- Backgrounds: 7 animated styles, your own photos and videos (with a slow zoom-and-pan effect), or Pexels stock (buyer's free key)
- Music: original tracks generated in 5 moods with automatic ducking under the voice, or your own file
- Brand kits (logo, colours, font, handle, end screen), batch mode with zip download, SRT subtitles
- Autosave, recovery after refresh, offline-capable core
- Optional Lemon Squeezy license gate with Basic/Pro tiers. Works offline after activation and locks out refunded keys.

**Not in v1:** lipsync talking avatars and AI-generated images. Both are planned as optional add-ons that use the buyer's own HeyGen/D-ID or image-API key.

## Local development
```bash
npm start            # http://localhost:8080
npm test             # full suite (~25 min). Needs Playwright + ffmpeg.
npm run test:quick   # skips the slowest stress tests
```
The test report is written to `tests/report/TEST-REPORT.md`, with sample videos in `tests/report/samples/`.

## Third-party components (bundled in `app/vendor`, versions pinned in `tools/build-vendor.sh`)
mp4-muxer and webm-muxer (MIT), fflate (MIT), kokoro-js / Transformers.js / ONNX Runtime Web (Apache-2.0), ffmpeg.wasm (MIT; the core includes LGPL/GPL components such as x264). Fonts are Anton, Bebas Neue, Montserrat, Poppins and Playfair Display (SIL Open Font License). The voice model, Kokoro-82M, is Apache-2.0.
