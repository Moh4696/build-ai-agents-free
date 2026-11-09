# Manual checks before each release (10 minutes)

The automated suite (`npm test`) runs in Chromium, the engine behind Chrome and Edge. Firefox and Safari couldn't be installed on the test machine, so check them by hand.

For each browser below, open the app and:

1. Click **Load an example**, then **▶ Play preview**. Captions should animate over the background.
2. **Voice → No voice**, then **Make my video** at **720p**.
3. Play the downloaded file. It should have captions, music, and the logo or handle in the corner.
4. On the result, the label should say **"✓ Ready for TikTok, Instagram & YouTube"**. If not, click **Convert to MP4** and check that it finishes.

| Browser | Expected | Your result |
|---|---|---|
| Chrome (Windows) | Direct MP4 export (fast) | |
| Chrome (Mac) | Direct MP4 export (fast) | |
| Edge (Windows) | Direct MP4 export (fast) | |
| Firefox (latest) | Exports; may convert to MP4 automatically (slower) | |
| Safari 17+ (Mac) | Exports; may convert to MP4 automatically (slower) | |
| Phone browser | Editing and preview work; exporting is slow and not recommended | |

If a browser fails, note what happened and ask Claude to fix it before selling.
