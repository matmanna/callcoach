/**
 * On-device NER via Transformers.js, loaded from local files only. Runs in the browser or the
 * Tauri webview. Raw text and entities never leave this context.
 */
import type { NerEntity, NerToken } from "./nerTypes.ts";
import { tokensToEntities } from "./nerMapping.ts";

export const NER_MODEL_ID = "Xenova/bert-base-NER";
/** q8 weights: onnx/model_quantized.onnx (108,952,255 bytes on the Hub at time of writing). */
export const NER_DTYPE = "q8";
export const NER_MODEL_BYTES = 108_952_255;
export const LOCAL_MODEL_PATH = "/models/";
/** ONNX Runtime wasm files copied by `pnpm models:fetch` from node_modules (no CDN). */
export const ORT_WASM_PATHS = { mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs", wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm" };

type TokenPipeline = (text: string, options: { ignore_labels: string[] }) => Promise<NerToken[]>;

export interface NerStatus {
  ready: true;
  ms: number;
  backend: string;
}

let pipe: TokenPipeline | null = null;
let status: NerStatus | null = null;
let loading: Promise<NerStatus> | null = null;

/** Test seam: replace the pipeline factory so tests never load a model. */
export type PipelineFactory = (device: "webgpu" | "wasm") => Promise<TokenPipeline>;

async function defaultFactory(device: "webgpu" | "wasm"): Promise<TokenPipeline> {
  const tf = await import("@huggingface/transformers");
  tf.env.allowRemoteModels = false;
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = LOCAL_MODEL_PATH;
  tf.env.useBrowserCache = false;
  // Route through the current window.fetch so the lab's request counter sees every load.
  tf.env.fetch = (input: string | URL, init?: RequestInit) => window.fetch(input, init);
  const onnx = tf.env.backends.onnx;
  if (onnx.wasm) onnx.wasm.wasmPaths = { ...ORT_WASM_PATHS };
  const p = await tf.pipeline("token-classification", NER_MODEL_ID, { device, dtype: NER_DTYPE });
  return (text, options) => p(text, options) as unknown as Promise<NerToken[]>;
}

let factory: PipelineFactory = defaultFactory;
export function setPipelineFactory(f: PipelineFactory | null): void {
  factory = f ?? defaultFactory;
  pipe = null;
  status = null;
  loading = null;
}

function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as Navigator & { gpu?: unknown }).gpu;
}

/** Try WebGPU when present, else WASM. Logs the active backend. */
export function loadNer(): Promise<NerStatus> {
  if (status) return Promise.resolve(status);
  if (loading) return loading;
  loading = (async () => {
    const started = performance.now();
    let backend: "webgpu" | "wasm" = "wasm";
    if (webGpuAvailable()) {
      try {
        pipe = await factory("webgpu");
        backend = "webgpu";
      } catch (err) {
        console.warn("[localAi] WebGPU NER failed, falling back to WASM:", err instanceof Error ? err.name : "error");
      }
    }
    if (!pipe) pipe = await factory("wasm");
    status = { ready: true, ms: Math.round(performance.now() - started), backend };
    console.info(`[localAi] NER ready: backend=${backend} load_ms=${status.ms}`);
    return status;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export function nerStatus(): NerStatus | null {
  return status;
}

export async function runNer(text: string): Promise<NerEntity[]> {
  if (!pipe) await loadNer();
  if (!pipe) throw new Error("NER not loaded");
  const tokens = await pipe(text, { ignore_labels: [] });
  return tokensToEntities(text, tokens);
}
