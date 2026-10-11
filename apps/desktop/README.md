# Stewardship Copilot desktop prototype

Tauri 2 packages the existing React app without adding privileged filesystem, shell, or
HTTP plugins. Microphone capture, Whisper transcription, and NER redaction run inside the
webview. The only Rust is the generated Tauri entry point.

## Prepare and run

```sh
pnpm install
pnpm models:fetch
docker compose up -d
pnpm db:init && pnpm db:seed
pnpm desktop:dev
```

`models:fetch` is the one network-dependent model setup step. It downloads quantized
`Xenova/whisper-tiny.en` and `Xenova/bert-base-NER` assets to gitignored paths under
`apps/web/public/models` and copies ONNX Runtime wasm beside them. During a call,
Transformers.js has remote models and browser caching disabled.

`desktop:dev` runs the local API and Tauri. Tauri's `beforeDevCommand` starts Vite, whose
same-origin `/api` proxy preserves the existing Better Auth session behavior. MongoDB must
already be running.

```sh
pnpm desktop:build
```

The build bundles the web app and local model assets. A distributable deployment still
needs the API to be hosted or run as a separate service; embedding the Node API and MongoDB
inside the desktop bundle is outside this prototype.

## Microphone and CSP

`src-tauri/Info.plist` supplies the macOS microphone purpose string. The app asks for mic
access only after the volunteer selects **Start listening**.

The CSP permits local app assets, Tauri core IPC, the local API, Vite HMR in development,
and the wasm/blob execution required by ONNX Runtime. It contains no model CDN or AWS
origin. No Tauri plugin can read files, execute shell commands, or make arbitrary HTTP
requests.
