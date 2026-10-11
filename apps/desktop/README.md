# apps/desktop (prototype shell)

Tauri 2 packaging for `apps/web`. Prototype only. No Rust logic beyond the generated
entry point, no plugins (no fs, shell, or http). All local AI runs in the webview and
works the same in a plain browser tab.

## Run

```
pnpm desktop:dev     # starts Vite (LAB_ENABLED=1) via beforeDevCommand, opens the window
pnpm desktop:build   # builds apps/web (LAB_ENABLED=1), then the desktop binary and bundles
```

Linux prerequisites: Rust (stable), webkit2gtk-4.1, libsoup3, gtk3, librsvg.
macOS: Xcode command line tools and Rust.

## CSP origins

`src-tauri/tauri.conf.json` holds the CSP as JSON, which cannot carry comments, so the
reason for each allowed origin lives here.

| Directive | Source | Why |
|---|---|---|
| `connect-src` | `'self'` | App's own assets, including `/models/` (local NER model files). |
| `connect-src` | `ipc:` `http://ipc.localhost` | Tauri IPC channel (core only, no plugins). |
| `connect-src` | `http://localhost:8787` | Local API, used only by the lab pages (`/lab/...`). |
| `connect-src` | `http://127.0.0.1:11434` | Ollama local LLM (Phase 2, optional, user-installed). |
| `connect-src` (dev only) | `ws://localhost:5173` | Vite HMR websocket during `desktop:dev`. |
| `script-src` | `'wasm-unsafe-eval'` | ONNX Runtime WebAssembly for the local NER model. |
| `script-src` | `blob:` | Transformers.js imports the cached ONNX Runtime wasm factory from a blob URL. |
| `worker-src` | `blob:` | ONNX Runtime may start its wasm worker from a blob URL. |
| `img-src` | `data:` | Inline data-URI images only. |
| `style-src` | `'unsafe-inline'` | React inline `style` attributes in the plain lab UI. |

No remote origin (CDN, Hugging Face, AWS) is allowed. Model and wasm files must be
fetched once with `pnpm models:fetch` and are then served from the app itself.
