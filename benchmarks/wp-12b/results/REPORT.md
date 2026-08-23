# WP-12B Cost Benchmark

Evidence SHA-256: `f29da6ada2a4bc73746fdb2e7af94ea0f3c41ac93e284df8e8178ea9098bf0e1`

## Measured matrix

| Archetype | Architecture | Wall ms | CPU s | Peak MiB | Output bytes | Chromium |
|---|---|---:|---:|---:|---:|---|
| title-card | sharp-per-frame | 471.4 | 0.446 | 110.6 | 9342 | NO |
| split-panel | sharp-per-frame | 436.8 | 0.418 | 109.9 | 9161 | NO |
| timeline | sharp-per-frame | 476.4 | 0.441 | 110.4 | 9023 | NO |
| data-chart | sharp-per-frame | 485.5 | 0.454 | 110.3 | 11643 | NO |
| quote-card | sharp-per-frame | 462.8 | 0.433 | 110.7 | 9240 | NO |
| device-ui | sharp-per-frame | 532.6 | 0.499 | 110.8 | 8751 | YES |
| webpage-scroll | sharp-per-frame | 470.3 | 0.455 | 111.6 | 10607 | YES |
| kinetic-text | sharp-per-frame | 491.6 | 0.467 | 110.7 | 9826 | NO |
| title-card | render-once-filter-graph | 348.5 | 0.317 | 89.1 | 6984 | NO |
| split-panel | render-once-filter-graph | 346.3 | 0.318 | 89.2 | 6811 | NO |
| timeline | render-once-filter-graph | 441.0 | 0.395 | 89.0 | 6511 | NO |
| data-chart | render-once-filter-graph | 360.7 | 0.327 | 89.0 | 8001 | NO |
| quote-card | render-once-filter-graph | 359.0 | 0.330 | 89.1 | 6923 | NO |
| device-ui | render-once-filter-graph | 350.5 | 0.320 | 88.9 | 6490 | YES |
| webpage-scroll | render-once-filter-graph | 352.3 | 0.322 | 89.3 | 8179 | YES |
| kinetic-text | render-once-filter-graph | 354.5 | 0.326 | 89.1 | 7095 | NO |

## Cost/video model

| Profile | Architecture | Critics | Projected compute s | Media | Stage 14 | Measured scope total | ≤ $30 |
|---|---|---:|---:|---:|---:|---:|---|
| FULL | sharp-per-frame | 9 | 4133.5 | $0.0147 | $0.2520 | $0.2667 | YES |
| REDUCED | render-once-filter-graph | 4 | 3145.8 | $0.0112 | $0.1120 | $0.1232 | YES |
| REDUCED_DETERMINISTIC_MAX | render-once-filter-graph | 4 | 4246.8 | $0.0151 | $0.1120 | $0.1271 | YES |

## Numeric conclusion

**ALL_THREE_WITHIN_30_USD_FOR_MEASURED_SCOPE**

This is a decision checkpoint, not production spend. The Stage 14 model is a pricing fixture and is explicitly **not QUALIFIED**. The total excludes every unqualified/unmeasured provider and rework; it cannot be represented as the final all-in factory cost. Owner numeric confirmation is still mandatory before WP-13.
