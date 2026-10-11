/** Local Whisper speech recognition. Remote model loading and browser caching are disabled. */
export const ASR_MODEL_ID = "Xenova/whisper-tiny.en";
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
  const pipeline = await tf.pipeline("automatic-speech-recognition", ASR_MODEL_ID, { device, dtype: ASR_DTYPE });
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
