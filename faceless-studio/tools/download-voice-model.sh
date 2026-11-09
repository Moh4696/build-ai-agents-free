#!/usr/bin/env bash
# Downloads the free AI voice model (~95 MB) so you can host it yourself instead of relying on Hugging Face.
# Usage: tools/download-voice-model.sh [output-dir]   (default: app/models)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HERE/app/models}"
BASE="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
DEST="$OUT/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
mkdir -p "$DEST/onnx" "$DEST/voices"
for f in config.json tokenizer.json tokenizer_config.json onnx/model_quantized.onnx; do
  [ -s "$DEST/$f" ] || curl -sSfL --retry 3 -o "$DEST/$f" "$BASE/$f"
done
for v in af_heart af_bella af_nicole af_sarah am_michael am_adam am_fenrir am_puck bf_emma bf_isabella bm_george bm_lewis; do
  [ -s "$DEST/voices/$v.bin" ] || curl -sSfL --retry 3 -o "$DEST/voices/$v.bin" "$BASE/voices/$v.bin"
done
echo "Voice model saved to $OUT"
