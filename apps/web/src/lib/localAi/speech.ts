/** Local Whisper speech recognition. Remote model loading and browser caching are disabled. */
/** Browser build: smallest Whisper, so the page loads fast on any laptop. */
export const ASR_MODEL_WEB = "Xenova/whisper-tiny.en";
/**
 * Desktop (Tauri) build: base.en. The app ships its model files locally and runs on a machine
 * with far more RAM than a browser tab gets, and base.en is much more accurate than tiny.en on
 * conversational speech. Still CPU-only in the webview (WebGPU is not available on Linux WebKit).
 */
export const ASR_MODEL_DESKTOP = "Xenova/whisper-base.en";

/** True inside the Tauri webview. Checked at call time, so tests can stub `window`. */
export const isDesktopRuntime = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const asrModelId = (desktop: boolean = isDesktopRuntime()): string => (desktop ? ASR_MODEL_DESKTOP : ASR_MODEL_WEB);
export const ASR_DTYPE = "q8";

type SpeechResult = { text?: string } | Array<{ text?: string }>;
type SpeechPipeline = (audio: Float32Array) => Promise<SpeechResult>;
export type SpeechPipelineFactory = (device: "webgpu" | "wasm") => Promise<SpeechPipeline>;

export interface SpeechStatus {
  ready: true;
  backend: "webgpu" | "wasm";
  ms: number;
}

let speech: SpeechPipeline | null = null;
let status: SpeechStatus | null = null;
let loading: Promise<SpeechStatus> | null = null;

async function webGpuAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function defaultFactory(device: "webgpu" | "wasm"): Promise<SpeechPipeline> {
  const tf = await import("@huggingface/transformers");
  tf.env.allowRemoteModels = false;
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = "/models/";
  tf.env.useBrowserCache = false;
  tf.env.fetch = (input: string | URL, init?: RequestInit) => window.fetch(input, init);
  const onnx = tf.env.backends.onnx;
  if (onnx.wasm) onnx.wasm.wasmPaths = "/ort/";
  const pipeline = await tf.pipeline("automatic-speech-recognition", asrModelId(), { device, dtype: ASR_DTYPE });
  return (audio) => pipeline(audio) as unknown as Promise<SpeechResult>;
}

let factory: SpeechPipelineFactory = defaultFactory;

/** Test seam; resetting never retains audio or transcript text. */
export function setSpeechPipelineFactory(next: SpeechPipelineFactory | null): void {
  factory = next ?? defaultFactory;
  speech = null;
  status = null;
  loading = null;
}

export function loadSpeechModel(): Promise<SpeechStatus> {
  if (status) return Promise.resolve(status);
  if (loading) return loading;
  loading = (async () => {
    const started = performance.now();
    let backend: "webgpu" | "wasm" = "wasm";
    if (await webGpuAvailable()) {
      try {
        speech = await factory("webgpu");
        backend = "webgpu";
      } catch {
        speech = null;
      }
    }
    if (!speech) speech = await factory("wasm");
    status = { ready: true, backend, ms: Math.round(performance.now() - started) };
    return status;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export async function transcribeLocal(audio: Float32Array): Promise<string> {
  if (!speech) await loadSpeechModel();
  if (!speech) throw new Error("Local speech model unavailable");
  const result = await speech(audio);
  const first = Array.isArray(result) ? result[0] : result;
  return typeof first?.text === "string" ? first.text.trim() : "";
}
