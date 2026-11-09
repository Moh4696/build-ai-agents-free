#!/usr/bin/env bash
# Rebuilds app/vendor from pinned npm versions. Only needed if you want to update libraries.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
cd "$WORK"
npm init -y >/dev/null
npm i --silent mp4-muxer@5.2.2 webm-muxer@5.1.4 fflate@0.8.2 kokoro-js@1.2.1 esbuild@0.28.2 \
  @ffmpeg/ffmpeg@0.12.15 @ffmpeg/core@0.12.10 \
  @fontsource/anton@5 @fontsource/montserrat@5 @fontsource/bebas-neue@5 @fontsource/poppins@5 @fontsource/playfair-display@5
printf 'export { KokoroTTS } from "kokoro-js";\nexport { env } from "@huggingface/transformers";\n' > kentry.js
npx esbuild kentry.js --bundle --format=esm --platform=browser --minify --outfile=kokoro.mjs --log-level=warning
# Let the app choose where voice files are downloaded from (self-hosting support).
node -e '
const fs=require("fs");let s=fs.readFileSync("kokoro.mjs","utf8");
const from="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${o}.bin";
if(!s.includes(from)) throw new Error("kokoro voice URL not found; update the patch");
s=s.replace(from,"${globalThis.__FS_MODEL_BASE||\"https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/\"}voices/${o}.bin");
fs.writeFileSync("kokoro.mjs",s);'
A="$HERE/app"
mkdir -p "$A/vendor/ffmpeg" "$A/vendor/ffmpeg-core" "$A/vendor/kokoro" "$A/fonts"
cp node_modules/mp4-muxer/build/mp4-muxer.mjs node_modules/webm-muxer/build/webm-muxer.mjs "$A/vendor/"
cp node_modules/fflate/esm/browser.js "$A/vendor/fflate.mjs"
cp node_modules/@ffmpeg/ffmpeg/dist/esm/*.js "$A/vendor/ffmpeg/"
cp node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.* "$A/vendor/ffmpeg-core/"
cp kokoro.mjs "$A/vendor/kokoro/kokoro.mjs"
cp node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.{mjs,wasm} "$A/vendor/kokoro/"
for f in anton/files/anton-latin-400-normal bebas-neue/files/bebas-neue-latin-400-normal montserrat/files/montserrat-latin-800-normal \
         poppins/files/poppins-latin-600-normal playfair-display/files/playfair-display-latin-700-normal; do
  cp "node_modules/@fontsource/$f.woff2" "$A/fonts/"
done
echo "Vendor files rebuilt in $A"
