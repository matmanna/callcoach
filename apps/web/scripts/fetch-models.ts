/**
 * `pnpm models:fetch`: the ONLY step that needs the network. Downloads the NER model files into
 * apps/web/public/models/ and copies the ONNX Runtime wasm files (from node_modules, no network)
 * into apps/web/public/ort/. Both folders are gitignored.
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODEL_ID = "Xenova/bert-base-NER";
const REVISION = "main";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "onnx/model_quantized.onnx"];

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelDir = join(webRoot, "public", "models", MODEL_ID);
const ortDir = join(webRoot, "public", "ort");

async function download(file: string) {
  const dest = join(modelDir, file);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`skip  ${file} (exists)`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file}`;
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
for (const f of FILES) await download(f);
console.log(`done: ${MODEL_ID} in public/models`);
