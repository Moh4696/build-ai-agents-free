# Blind voice listening test (3 people, about 10 minutes each)

**Why:** a speech recogniser already confirmed the free AI voice is *understandable*. Whether it sounds *natural enough to pay for* needs real people.

## How to run it
1. Send each person the 6 clips (A–F) **without the scripts**. Ask them to listen once on **phone speakers** and once on **headphones**, at a comfortable volume.
2. Ask them to fill in the form below for each clip, without discussing it with each other.
3. Copy their answers into the results table.

**Pass:** average naturalness ≥ 3.5. **Borderline (2.5–3.5):** use ElevenLabs voices for paid client work. **Fail (< 2.5):** the free voice isn't good enough to sell.

## Form questions (create a free Google Form; repeat for each clip A–F)
1. How easy was it to understand? (1 = very hard, 5 = very easy)
2. How natural did the voice sound? (1 = very robotic, 5 = like a real person)
3. Was the speed right? (Too slow / Just right / Too fast)
4. Could you hear the voice clearly over the music? (1 = no, 5 = perfectly)
5. Were there any words you couldn't make out? (free text)
6. Would this put you off a business that posted it? (Yes / No / Not sure)

## Results

| Clip | Rater 1 natural | Rater 2 natural | Rater 3 natural | Average | Words missed |
|---|---|---|---|---|---|
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |
| E | | | | | |
| F | | | | | |

---

## The clips (for rendering only; don't send these scripts to raters)
Render with: `node tools/render-scripts.mjs validation/voice-test.md --out renders/voice-test`

### VA: UK male, calm
<!-- voice: bm_george, template: story, mood: calm, caption: bold-pop -->
```text
Most boilers break down when you need them most, on the first cold week of the year. An annual service helps catch small problems before they become expensive ones.
```

### VB: UK female, upbeat music
<!-- voice: bf_emma, template: story, mood: upbeat, caption: bold-pop -->
```text
Blocked gutters are one of the cheapest problems to fix, and one of the most expensive to ignore. A quick clear-out after the autumn leaves can save you a much bigger bill.
```

### VC: Numbers and dates
<!-- voice: bf_emma, template: story, mood: lofi, caption: bold-pop -->
```text
Landlords in England need an electrical safety report at least every 5 years. If your last one was in 2019, call us before the 31st of March.
```

### VD: US female, for comparison
<!-- voice: af_heart, template: story, mood: calm, caption: bold-pop -->
```text
Radiators cold at the top but warm at the bottom? That usually means trapped air. Bleeding them takes a few minutes and can make your whole home feel warmer.
```

### VE: UK male, music at full volume
<!-- voice: bm_lewis, template: story, mood: dramatic, volume: 1, caption: bold-pop -->
```text
After a big storm, take five minutes to check your home from the ground. Look for tiles on the lawn, bent guttering, or anything loose around the chimney. Never climb up yourself.
```

### VF: UK female, faster speed
<!-- voice: bf_isabella, template: story, mood: corporate, speed: 1.15, caption: bold-pop -->
```text
Choosing a builder? Ask to see recent work, get the quote and timeline in writing, and agree how payments will be staged before anything starts.
```
