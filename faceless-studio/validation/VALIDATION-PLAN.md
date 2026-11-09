# 3-week demand test (£0 budget, UK trades)

**The one question:** will anyone pay for this?

Building more features before that's answered is a gamble. This plan gives you a **go / change / stop** decision in 21 days, based on numbers you record.

## What you test

| # | Test | What counts | Where |
|---|---|---|---|
| 1 | **Service:** done-for-you videos for UK tradespeople | Money received | `service/` |
| 2 | **Tool:** "do it yourself" app for £39 one-time | Waitlist sign-ups with the price shown (no payments yet: no Lemon Squeezy account) | `tool/` |
| 3 | **Voice quality:** is the free AI voice good enough? | Ratings from 3 people | `voice-test.md` |

Test 1 is the most important. It's the only one that measures real payment.

## Pass / change / stop

| Test | ✅ Pass (by day 21) | 🔁 Change once and retest | ⛔ Stop |
|---|---|---|---|
| Service | **≥ 1 tradesperson pays ≥ £200** for their first month, up front | ≥ 3 say yes to the free trial, but nobody pays → change price or offer, run 2 more weeks | 0 paying after ~300 messages, twice |
| Tool | **≥ 20 waitlist sign-ups** with the price visible | Videos get views but < 20 sign-ups → change offer or price, retest | < 1,000 total views across 20 posts → stop investing in the tool |
| Voice | Average naturalness **≥ 3.5 / 5** | 2.5–3.5 → use ElevenLabs voices for paid work | < 2.5 → don't sell the free voice |

Also record, but these aren't pass/fail: reply rate, top objections, and which of the two prices (£249 / £449) got more yeses.

## What's already done for you
- **30 trades scripts** in `service/trades-scripts.md`.
- **10 portfolio sample videos**, using a placeholder brand (sent to you as files).
- **20 ready-to-post videos**, with scripts in `tool/daily-posts.md` (sent to you as files).
- **Messages, price test, objections and how to get paid:** `service/outreach-uk-trades.md`.
- **Tracker spreadsheet with automatic scoring:** `service/prospect-tracker.xlsx`.
- **Waitlist page:** `tool/waitlist.html`, plus a 6-clip voice test (`voice-test.md`).

## Before day 1 (about 2 hours)
1. Create a free **Google Form** called "Faceless Studio early access" with: name, email, trade or business type, and "Would you pay £39 one-time for this tool? (Yes / Maybe / No)". Copy its link.
2. Put that link into `tool/waitlist.html` where it says `YOUR-FORM-LINK`, and your contact email where it says `YOUR-EMAIL`.
3. Put the waitlist page online for free (see `tool/HOSTING.md`). Add the address to your TikTok / Instagram bio.
4. Create the voice-test Google Form and send the 6 clips to 3 people.
5. Watch the 10 sample videos so you can talk about them confidently.

## Daily (about 1.5–2 hours)

| Task | Time |
|---|---|
| Find and log 20 trades businesses in the tracker | 30 min |
| Make free personalised samples for the best 3–5 | 40 min |
| Send messages and follow-ups, then update the tracker | 30 min |
| Post today's video (`D01` … `D20`) and note its views a day later | 10 min |

## Weekly check (Sunday, 15 minutes)
Open the tracker's **Summary** tab.
- **End of week 1:** fewer than 5 replies from ~100 messages? The first message isn't landing. Try a different script for the free sample, or a different trade.
- **End of week 2:** replies but no trial yeses? The offer is the problem. Try the free trial first, or the lower price.
- **End of week 3:** compare against the pass / change / stop table and decide.

## What happens after
- **Service passes:** keep delivering to that client, ask for a referral, and repeat. Only then improve the app (audio polish, caption sync).
- **Tool passes:** set up Lemon Squeezy (see `../docs/LAUNCH-GUIDE.md`) and convert the waitlist into real pre-orders.
- **Both fail twice:** stop. Look at the other shortlisted idea instead: the private bank-statement converter from the earlier research.
