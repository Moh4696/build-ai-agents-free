// Edit these values before selling. See docs/LAUNCH-GUIDE.md.
export const CONFIG = {
  appName: 'Faceless Studio',
  // 'off' = everything unlocked (use this for your own client work).
  // 'lemonsqueezy' = buyers must enter a license key from your Lemon Squeezy store.
  licenseMode: 'off',
  lemonSqueezy: {
    storeId: 0,
    productId: 0,
    // Any variant whose name contains this text unlocks Pro features.
    proVariantMatch: 'pro',
  },
  buyUrl: 'https://your-store.lemonsqueezy.com/',
  // Where the free AI voice model downloads from. null = Hugging Face.
  // To self-host, run tools/download-voice-model.sh and set this to '/models/'.
  voiceModelHost: null,
};
