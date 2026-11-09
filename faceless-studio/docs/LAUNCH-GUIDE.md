# Launch Guide (no coding needed)

This guide gets Faceless Studio online, connected to payments, and ready to sell. Every step is clicking and copy-pasting. Expect about an hour the first time.

**What it costs:** Lemon Squeezy has no monthly fee (they take a cut of each sale), and you don't need a domain name. **Hosting is not free for selling:** Vercel's free Hobby plan is "restricted to non-commercial personal use only", so selling the app, or using it for paid client work, needs a plan that allows commercial use, such as Vercel Pro (check the current price). For free options and their limits, see [`../validation/tool/HOSTING.md`](../validation/tool/HOSTING.md).

---

## Part 1 — Put the app online (Vercel)

> ⚠️ The steps below work on Vercel's free Hobby plan for **trying the app out personally**. Before you sell it, take payments through it, or use it for paid client work, upgrade the project to a plan that allows commercial use (see `HOSTING.md`).

1. Go to **vercel.com** and click **Sign Up** → **Continue with GitHub**. Use the same GitHub account that holds this project.
2. Click **Add New… → Project**.
3. Find **build-ai-agents-free** in the list and click **Import**.
4. Next to **Root Directory** click **Edit**, choose `faceless-studio/app`, and click **Continue**.
5. Leave **Framework Preset** as **Other**. Don't change anything else.
6. Click **Deploy**. Wait about a minute.
7. Click the preview image. Your app is live at an address like `build-ai-agents-free.vercel.app`. Bookmark it.

> Tip: rename the address in Vercel → your project → **Settings → Domains** (for example `facelessstudio.vercel.app`).

At this point the app is in **Studio mode**: everything is unlocked and there's no license screen. Use it like this for your own client work (see `SERVICE-KIT.md`).

---

## Part 2 — Make your first video (5 minutes)

1. Open your app address in **Chrome** or **Edge** on a computer.
2. Click **Load an example**.
3. Tab **3. Voice** → **Free AI voice** → click **▶ Hear this voice**. The first time, it downloads the voice (about 90 MB, once).
4. Tab **5. Brand** → pick your colours and type your handle.
5. Click **Make my video**. When it finishes, click **Download video**.

Post that video. Videos made with the tool are your best advert.

---

## Part 3 — Sell the tool (Lemon Squeezy)

Lemon Squeezy handles checkout, tax and license keys for you.

### 3a. Create the product
1. Go to **lemonsqueezy.com** → **Get started** and create a store. You can stay in **Test mode** while setting up.
2. **Products → New product.** Name: `Faceless Studio`. Pricing: **Single payment**.
3. Add two **variants**:
   - `Basic`: $49
   - `Pro`: $99 (the variant name **must contain the word "Pro"**; that's how the app knows to unlock Pro features)
4. In the product settings, turn on **Generate license keys**. Set **Activation limit** to 3 (one buyer, up to 3 browsers) and **License length** to **Unlimited**.
5. Under **Confirmation / email**, paste this as the thank-you message:
   > Thanks for buying Faceless Studio! Open **https://YOUR-APP.vercel.app** in Chrome or Edge, paste your license key when asked, and start making videos.
6. Save. Copy the **Product ID** (in the product's URL or on its page) and your **Store ID** (Settings → Stores).

### 3b. Switch the app to "license required"
1. On **github.com**, open your repository → `faceless-studio/app/js/config.js` → click the ✏️ pencil icon.
2. Change these lines (keep the quotes and commas exactly as shown):
   ```js
   licenseMode: 'lemonsqueezy',
   storeId: 12345,        // your Store ID
   productId: 67890,      // your Product ID
   buyUrl: 'https://YOURSTORE.lemonsqueezy.com/checkout/buy/...', // your product's checkout link
   ```
3. Click **Commit changes**. Vercel redeploys automatically in about a minute.
4. Open your app. You should now see the **Unlock** screen.

> **Keep your own unlocked copy for client work:** in Vercel, deploy the same repo a second time as a separate project (for example `my-studio`) and leave `licenseMode: 'off'`. The easy way is a second branch with the original config. Ask Claude to set this up if you want it.

### 3c. Test a purchase
1. In Lemon Squeezy **Test mode**, buy your own product with the test card `4242 4242 4242 4242`.
2. Copy the license key from the email and paste it into your app. It should unlock and show **Pro** or **Basic** in the top bar.
3. In Lemon Squeezy, **refund** that test order, then reload the app. It should ask for a key again. That's how refunds get locked out.
4. Switch Lemon Squeezy to **Live mode** when you're ready.

---

## Part 4 — The sales page

`faceless-studio/landing/index.html` is a ready-made sales page.

1. Deploy it as another Vercel project (repeat Part 1 with Root Directory `faceless-studio/landing`).
2. Edit `landing/index.html` on GitHub. Replace every `YOUR-CHECKOUT-LINK` with your Lemon Squeezy checkout links (one for Basic, one for Pro) and `YOUR-APP-LINK` with your app address.
3. Replace the demo video: make a 20–30 second video with the tool, upload it to the `landing` folder as `demo.mp4`, and commit.

**Honesty rules (important for refunds and for the law):** only show videos you actually made with the tool, don't invent reviews or sales numbers, and keep the "what you need" list accurate (Chrome or Edge on a computer; optional ElevenLabs/Pexels keys for the extra features).

---

## Part 5 — Optional: host the voice model yourself

By default, the free AI voice downloads from Hugging Face (a large, reliable model host). If you'd rather not depend on them:

1. Ask Claude to run `tools/download-voice-model.sh` and commit the `app/models` folder (about 95 MB).
2. In `config.js`, set `voiceModelHost: '/models/',`.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| "This browser cannot export video" | Use the latest Chrome or Edge on a computer. |
| Free voice won't load | Check your internet; try **Upload my voiceover** or **No voice**. |
| Export is slow | Choose **720p (faster)** quality, or close other tabs. |
| Downloaded a WebM file | Click **Convert to MP4** on the result, or tick "Always give me an MP4" before exporting. |
| A buyer says their key doesn't work | Check that their order isn't refunded in Lemon Squeezy, and that they haven't used up the 3 activations (you can reset activations in Lemon Squeezy). |
| Need a change to the app | Ask Claude, mentioning `faceless-studio`. Run `npm test` before every release. |
