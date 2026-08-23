# WP-12B benchmark harness

The harness measures eight deterministic visual archetypes through two render
architectures: Sharp-per-frame and render-once plus an FFmpeg filter graph. Each
case records wall time, CPU seconds, peak RSS, output size and the explicit need
for headless Chromium.

Run with an installed `sharp@0.35.3`, or point to that exact module:

```sh
SHARP_MODULE_PATH=/absolute/path/to/sharp node benchmarks/wp-12b/run.mjs
```

`inputs.json` is versioned and contains every economic assumption. The OpenAI
entry is a Stage 14 pricing fixture, not a qualified capability and not a provider
dispatch. `results/evidence.json` and `results/REPORT.md` are the immutable output
used at the mandatory owner checkpoint.
