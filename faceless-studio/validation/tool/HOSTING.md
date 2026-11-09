# Where to host (checked 14 October 2026)

Selling anything (even a waitlist page that advertises a price) counts as **commercial use**. Some free hosts don't allow that.

| Host | Free plan allows commercial use? | Can it host… | Source |
|---|---|---|---|
| **Vercel Hobby** | ❌ **No.** "Hobby teams are restricted to non-commercial personal use only." "Advertising the sale of a product or service" counts as commercial. | — | [Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) |
| **GitHub Pages** | ❌ Not for sites "primarily directed at" commercial activity | — | [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| **Cloudflare Pages** | ⚠️ No ban found, but I couldn't find Cloudflare's own wording confirming it. Third-party reviews say commercial use is allowed. | ✅ the waitlist page. ❌ the full app as it stands: 2 of its files (31 MB and 21 MB) exceed the **25 MiB per-file limit** | [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| **Netlify Free** | ⚠️ Not stated on their pricing page or terms of use (it may be in their subscription agreement) | ✅ both, but the free plan is a hard **300 credits a month**; at 20 credits per GB that's roughly 15 GB of downloads if spent only on bandwidth | [Netlify pricing](https://www.netlify.com/pricing/) |
| **Vercel Pro** | ✅ Yes (commercial use needs Pro or Enterprise) | ✅ both | [Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) |

## Recommendation for the 3-week test (£0)
- **Waitlist page:** Cloudflare Pages, via **Direct Upload** (no coding):
  1. Sign up free at cloudflare.com, then go to **Workers & Pages → Create → Pages → Upload assets**.
  2. Name the project (e.g. `faceless-studio-early-access`).
  3. Upload a folder containing `waitlist.html` **renamed to `index.html`**, plus one of your sample videos renamed to `demo.mp4`. First replace `YOUR-FORM-LINK` and `YOUR-EMAIL` in the file; you can open it in any text editor.
  4. You get a free address like `faceless-studio-early-access.pages.dev`. Put it in your bio.
- **The app itself, for making your client videos:** you're using it for paid work, so don't use Vercel Hobby.
  - **Option A (£0):** use the videos and scripts already made for you, and ask Claude to batch-render personalised samples with `tools/render-scripts.mjs`.
  - **Option B:** host on Netlify Free after reading their current subscription agreement and acceptable use policy yourself.
  - **After your first paying client:** move to a plan that clearly allows commercial use (e.g. Vercel Pro). Check the current price on their pricing page before signing up.

Re-check these terms before relying on them; hosting companies change their plans often.
