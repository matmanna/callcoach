/** Resample a mono waveform for Whisper, which expects 16 kHz Float32 audio. */
export function resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16_000) return input.slice();
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) throw new Error("Invalid audio sample rate");
  const ratio = sourceRate / 16_000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j] ?? 0;
    output[i] = sum / (end - start);
  }
  return output;
}

function join(chunks: readonly Float32Array[], length: number): Float32Array {
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Microphone samples stay in memory and are discarded immediately after each local inference. */
export class LocalAudioCapture {
  private chunks: Float32Array[] = [];
  private sampleCount = 0;
  private queue = Promise.resolve();
  private stopped = false;

  private constructor(
    private readonly stream: MediaStream,
    private readonly context: AudioContext,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly processor: ScriptProcessorNode,
    private readonly silent: GainNode,
    private readonly onChunk: (audio16k: Float32Array) => Promise<void>,
    private readonly chunkSeconds: number,
  ) {}

  static async start(onChunk: (audio16k: Float32Array) => Promise<void>, chunkSeconds = 8): Promise<LocalAudioCapture> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    const capture = new LocalAudioCapture(stream, context, source, processor, silent, onChunk, chunkSeconds);
    processor.onaudioprocess = (event) => capture.receive(event.inputBuffer.getChannelData(0));
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    return capture;
  }

  private receive(samples: Float32Array): void {
    if (this.stopped) return;
    const copy = samples.slice();
    this.chunks.push(copy);
    this.sampleCount += copy.length;
    if (this.sampleCount >= this.context.sampleRate * this.chunkSeconds) this.flush(false);
  }

  private flush(final: boolean): void {
    if (!this.sampleCount) return;
    if (final && this.sampleCount < this.context.sampleRate * 0.5) {
      this.chunks = [];
      this.sampleCount = 0;
      return;
    }
    const raw = join(this.chunks, this.sampleCount);
    this.chunks = [];
    this.sampleCount = 0;
    const audio = resampleTo16k(raw, this.context.sampleRate);
    this.queue = this.queue.then(() => this.onChunk(audio));
  }

  async stop(): Promise<void> {
    if (this.stopped) return this.queue;
    this.stopped = true;
    this.flush(true);
    this.processor.disconnect();
    this.source.disconnect();
    this.silent.disconnect();
    this.stream.getTracks().forEach((track) => track.stop());
    await this.context.close();
    await this.queue;
  }
}
