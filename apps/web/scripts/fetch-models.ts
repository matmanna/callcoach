/**
 * `pnpm models:fetch`: the ONLY step that needs the network. Downloads the local NER and
 * speech-recognition model files into apps/web/public/models/ and copies ONNX Runtime wasm
 * files (from node_modules, no network) into apps/web/public/ort/. Both folders are gitignored.
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const REVISION = "main";
const MODELS: Record<string, readonly string[]> = {
  "Xenova/bert-base-NER": [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
    "onnx/model_quantized.onnx",
  ],
  "Xenova/whisper-tiny.en": [
    "added_tokens.json",
    "config.json",
    "generation_config.json",
    "merges.txt",
    "normalizer.json",
    "preprocessor_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx",
  ],
};

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ortDir = join(webRoot, "public", "ort");

async function download(modelId: string, file: string) {
  const modelDir = join(webRoot, "public", "models", modelId);
  const dest = join(modelDir, file);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`skip  ${file} (exists)`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const url = `https://huggingface.co/${modelId}/resolve/${REVISION}/${file}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${res.status} fetching ${url}`);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(dest));
  console.log(`fetch ${file} (${statSync(dest).size} bytes)`);
}

function copyOrt() {
  // Resolve the onnxruntime-web that @huggingface/transformers itself depends on.
  const require = createRequire(import.meta.url);
  const tfEntry = require.resolve("@huggingface/transformers");
  const tfRequire = createRequire(tfEntry);
  const ortDist = dirname(tfRequire.resolve("onnxruntime-web"));
  mkdirSync(ortDir, { recursive: true });
  const wanted = readdirSync(ortDist).filter((f) => /^ort-wasm-simd-threaded\.(asyncify|jsep)?\.?(mjs|wasm)$/.test(f) || /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(f));
  for (const f of wanted) copyFileSync(join(ortDist, f), join(ortDir, f));
  console.log(`copied ${wanted.length} ONNX Runtime files to public/ort: ${wanted.join(", ")}`);
}

copyOrt();
for (const [modelId, files] of Object.entries(MODELS)) {
  for (const file of files) await download(modelId, file);
  console.log(`done: ${modelId} in public/models`);
}
