# Local AI and Tauri integration

## Call flow

1. Starting a log from the donor brief opens `/call/:donorId?log=:logId`.
2. The volunteer explicitly prepares the bundled Whisper and NER models.
3. **Start listening** requests microphone access. Eight-second mono chunks are resampled
   to 16 kHz and transcribed on the device.
4. Each recognized segment passes through the existing known-identifier, regex, and phrase
   rules plus local NER. A failed NER pass holds the segment instead of forwarding it.
5. Only scrubbed turns appear on screen. Raw audio and recognized raw text are released
   after each local pass.
6. Ending the call converts the scrubbed turns into the existing deterministic structured
   draft and hands it to the post-call page through a one-read in-memory map.
7. A typed post-call note uses the same local NER path. Approval still sends only the
   strict structured payload already shown in the device/send ledger.

There is no API route for audio, transcript, or typed note content. No database schema has
an audio, transcript, or raw note field. The standalone redaction lab's outbound experiment
was intentionally not exposed after integration because it conflicts with the repository
rule that only an approved structured payload leaves the device.

## Local assets

`pnpm models:fetch` installs:

- `Xenova/whisper-tiny.en` q8 encoder and merged decoder for English speech recognition.
- `Xenova/bert-base-NER` q8 weights for token classification.
- ONNX Runtime WebAssembly modules copied from the installed package.

All generated assets live under gitignored `apps/web/public/models` and
`apps/web/public/ort`. Vite copies them into `dist` for Tauri packaging. Model loaders set
`allowRemoteModels = false`, `allowLocalModels = true`, and `useBrowserCache = false`.

## Bedrock warmth crosscheck

The existing crosscheck makes one Converse call after the approved log and caller score
exist. It sends approved `LogFields` only, with `maxTokens: 300` and temperature zero. The
response is parsed with a strict Zod schema, score is restricted to 1–5, the reason is
truncated to 160 characters, and PII guard failure leaves the result unavailable. Caller and
model scores remain separate.

To enable it locally:

1. Authenticate an AWS CLI profile with short-lived credentials.
2. Grant that principal `bedrock:InvokeModel` for the selected model or inference profile.
3. Enable access to a Converse-compatible model in the target region.
4. Set `AWS_REGION`, `AWS_PROFILE`, and `BEDROCK_MODEL_ID` in `.env`.

The Bedrock client uses adaptive retries with five attempts. Tests inject a mock client and
never call AWS.
