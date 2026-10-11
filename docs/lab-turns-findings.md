# Lab turns findings

**MOCK Bedrock mode was used for every run.** These mock results and token estimates do not measure real model quality, tokenization, cost, or latency. Fixture turns were scrubbed in the browser-side rule code and sent to the in-process Hono API. Playback timestamps used a virtual clock at 1x and 10x; the injected 2-second delay and 250 ms retry backoff used real timers.

## Run results

Turn latency is measured from playback emission through local redaction and API response arrival. Characters count the scrubbed turn strings transmitted during the call. End-note characters count the summary plus the joined tag names sent alongside it. Bedrock mock input-token estimates use `ceil(prompt-and-input characters / 4)` and output estimates use the same approximation. The agreement column is `agree / rules-only / Bedrock-only / both different`; it compares rolling reads with the cue at the read's anchor donor turn. End-of-call reads are not per-turn comparisons.

| Mode | Run | p50 ms | p95 ms | Scrubbed chars | End-note chars | Bedrock calls | Input / output tokens | Per-call latency ms | Agree / rules-only / Bedrock-only / different |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| rules_only | 1x-1 | 0.21 | 20.80 | 1,227 | 190 | 0 | 0 / 0 | — | — |
| rules_only | 1x-2 | 0.08 | 0.15 | 1,227 | 190 | 0 | 0 / 0 | — | — |
| rules_only | 1x-3 | 0.07 | 0.10 | 1,227 | 190 | 0 | 0 / 0 | — | — |
| rules_end | 1x-1 | 0.07 | 0.47 | 1,227 | 190 | 1 | 125 / 24 | 509 | — |
| rules_end | 1x-2 | 0.07 | 0.18 | 1,227 | 190 | 1 | 125 / 24 | 508 | — |
| rules_end | 1x-3 | 0.11 | 0.27 | 1,227 | 190 | 1 | 125 / 24 | 507 | — |
| rules_rolling | 1x-1 | 0.22 | 0.60 | 1,227 | 190 | 3 | 629 / 57 | 829, 859, 509 | 0 / 0 / 1 / 0 |
| rules_rolling | 1x-2 | 0.21 | 0.72 | 1,227 | 190 | 3 | 629 / 57 | 826, 860, 507 | 0 / 0 / 1 / 0 |
| rules_rolling | 1x-3 | 0.22 | 0.64 | 1,227 | 190 | 3 | 629 / 57 | 827, 859, 509 | 0 / 0 / 1 / 0 |
| rules_only | 10x-drop | 0.08 | 251.45 | 1,227 | 190 | 0 | 0 / 0 | — | — |
| rules_only | 10x-delay | 0.21 | 2,001.34 | 1,227 | 190 | 0 | 0 / 0 | — | — |
| rules_only | 10x-duplicate | 0.17 | 0.51 | 1,306 | 190 | 0 | 0 / 0 | — | — |
| rules_end | 10x-drop | 0.15 | 252.15 | 1,227 | 190 | 1 | 125 / 24 | 507 | — |
| rules_end | 10x-delay | 0.20 | 2,001.72 | 1,227 | 190 | 1 | 125 / 24 | 507 | — |
| rules_end | 10x-duplicate | 0.22 | 0.49 | 1,306 | 190 | 1 | 125 / 24 | 507 | — |
| rules_rolling | 10x-drop | 0.18 | 252.15 | 1,227 | 190 | 3 | 629 / 57 | 826, 859, 508 | 0 / 0 / 1 / 0 |
| rules_rolling | 10x-delay | 0.18 | 2,002.63 | 1,227 | 190 | 3 | 629 / 57 | 826, 859, 508 | 0 / 0 / 1 / 0 |
| rules_rolling | 10x-duplicate | 0.18 | 0.60 | 1,306 | 190 | 3 | 629 / 57 | 827, 858, 507 | 0 / 0 / 1 / 0 |

The 20.80 ms p95 in the first rules-only sample reflects local test-runner scheduling; the remaining 1x p95 values were below 1 ms. Those numbers exclude a real browser-to-server network and must not be used as a production latency estimate.

## Fault injection observations

- **Drop next request:** the client throws before sending, waits the first 250 ms retry interval, then sends the turn. No cue was lost.
- **Delay next request 2s:** the delayed turn and later turns stayed in order; the added delay appeared in p95 turn latency at about 2,003 ms. The outbox tests verify later work stays queued behind the in-flight request.
- **Send next request twice:** the second request returned the saved idempotent response. No cue was doubled or reordered. The duplicate added 79 scrubbed characters to exposure (1,306 versus 1,227).
- No out-of-order or doubled cues were observed. A server guard 422 was tested separately: it is not retried, its text is omitted from the error, and the turn is dropped with identifier counts shown.

## Recommendation

For this synthetic fixture, server rule matching agreed with the browser's local cue result and returned in under a millisecond in most in-process samples, while streaming exposed 1,227 scrubbed characters compared with a 133-character end note. That tradeoff is not enough to justify streaming in a real donor call without measurements over the actual network and a clear operational need for centralized cues. Local-only cues should remain the default because they avoid the additional turn stream. The mock rolling reads added one Bedrock-only label in each run and no agreement with the anchor turn, so this experiment gives no evidence that rolling reads improve on the rules. In mock mode, an end read used one call and estimated 125 input plus 24 output tokens, while rolling mode used three calls and 629 input plus 57 output tokens. A production build should keep raw text in the browser, retain strict server identifier rejection and idempotency, and compare any real Bedrock suggestion against rule cues before showing it as a review aid. Real model accuracy, token usage, and latency remain unmeasured here.
