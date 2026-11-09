# Video verification record

All 36 videos were rendered with `tools/render-scripts.mjs` on 14 October 2026 (headless Chromium; H.264 conversion via the built-in converter) and checked automatically:
- **Format:** H.264 + AAC MP4, 1080×1920, decoded end to end with ffmpeg (0 errors = playable).
- **Loudness:** EBU R128 integrated loudness and true peak.
- **Speech:** transcribed by an independent recogniser (faster-whisper `small.en`), then compared with the script as word error rate (WER). On-screen list numbers aren't spoken and are excluded; number words vs digits and US/UK spellings count as the same word. Pass mark: ≤ 5%.

**Not checked automatically:** how natural the voice sounds. That's what `voice-test.md` (people listening) is for.

## Portfolio samples (service/trades-scripts.md)

| ID | Result | Length | Loudness (LUFS) | True peak (dBTP) | WER |
|---|---|---|---|---|---|
| B1 | ✅ | 20.8 s | -19.0 | -5.2 | 0.0% |
| B2 | ✅ | 14.7 s | -18.0 | -4.3 | 0.0% |
| B3 | ✅ | 15.8 s | -18.8 | -4.7 | 0.0% |
| E1 | ✅ | 21.1 s | -18.7 | -5.6 | 2.3% |
| E2 | ✅ | 18.4 s | -18.2 | -2.5 | 0.0% |
| P1 | ✅ | 19.9 s | -18.8 | -6.2 | 0.0% |
| P2 | ✅ | 17.3 s | -18.0 | -2.3 | 0.0% |
| P7 | ✅ | 16.6 s | -18.7 | -0.9 | 0.0% |
| R1 | ✅ | 20.1 s | -19.0 | -5.2 | 0.0% |
| R2 | ✅ | 18.3 s | -18.1 | -2.8 | 0.0% |

## Daily posts (tool/daily-posts.md)

| ID | Result | Length | Loudness (LUFS) | True peak (dBTP) | WER |
|---|---|---|---|---|---|
| D01 | ✅ | 20.1 s | -18.9 | -4.7 | 0.0% |
| D02 | ✅ | 16.9 s | -18.3 | -4.2 | 0.0% |
| D03 | ✅ | 18.2 s | -19.0 | -5.6 | 0.0% |
| D04 | ✅ | 16.5 s | -18.5 | -1.1 | 3.1% |
| D05 | ✅ | 19.1 s | -19.0 | -5.6 | 0.0% |
| D06 | ✅ | 14.0 s | -18.1 | -1.4 | 0.0% |
| D07 | ✅ | 19.7 s | -18.8 | -4.7 | 0.0% |
| D08 | ✅ | 15.7 s | -18.1 | -2.8 | 2.5% |
| D09 | ✅ | 21.7 s | -18.9 | -5.3 | 0.0% |
| D10 | ✅ | 14.8 s | -18.0 | -1.5 | 2.5% |
| D11 | ✅ | 19.3 s | -18.9 | -4.6 | 0.0% |
| D12 | ✅ | 11.7 s | -18.1 | -2.8 | 0.0% |
| D13 | ✅ | 19.1 s | -18.9 | -5.2 | 0.0% |
| D14 | ✅ | 15.8 s | -17.9 | -2.4 | 4.9% |
| D15 | ✅ | 17.3 s | -19.0 | -5.3 | 0.0% |
| D16 | ✅ | 13.8 s | -17.9 | -3.7 | 0.0% |
| D17 | ✅ | 19.5 s | -18.8 | -3.5 | 0.0% |
| D18 | ✅ | 15.8 s | -18.4 | -4.4 | 0.0% |
| D19 | ✅ | 8.9 s | -29.3 | -15.6 | no voice |
| D20 | ✅ | 16.2 s | -18.8 | -5.7 | 0.0% |

## Voice-test clips (voice-test.md)

| ID | Result | Length | Loudness (LUFS) | True peak (dBTP) | WER |
|---|---|---|---|---|---|
| VA | ✅ | 12.0 s | -18.6 | -5.9 | 0.0% |
| VB | ✅ | 10.2 s | -18.1 | -2.1 | 0.0% |
| VC | ✅ | 10.5 s | -18.2 | -1.9 | 0.0% |
| VD | ✅ | 10.3 s | -18.3 | -5.3 | 0.0% |
| VE | ✅ | 12.4 s | -18.9 | -1.2 | 0.0% |
| VF | ✅ | 8.7 s | -18.4 | -3.7 | 0.0% |

## Findings to act on

1. **Acronyms:** the free voice says "EICR" as a word. The recogniser heard "ICA" (D04) and "ICO" (E1). Listen to E1 and D04. If it sounds wrong, spell it out in the script (e.g. "E-I-C-R") and re-render. That spelling hasn't been tested yet.
2. **"Link in bio"** was transcribed as "link in bios" in several posts. It could be the voice or the recogniser; check by ear.
3. **Videos without a voice are much quieter.** D19 (music only) measures −29.3 LUFS against about −18 for voiced videos, even at full music volume. The engine only turns loud audio down and never brings quiet audio up. Fixing this needs loudness normalisation in `app/js/engine/audio.js` (proposed, not done).
4. All voiced videos sit around **−18 LUFS**. Many platforms play videos louder than that, so consider the same normalisation fix before scaling up.
