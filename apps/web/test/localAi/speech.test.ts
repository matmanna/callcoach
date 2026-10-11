import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSpeechModel, setSpeechPipelineFactory, transcribeLocal } from "../../src/lib/localAi/speech.ts";

afterEach(() => setSpeechPipelineFactory(null));

describe("local speech", () => {
  it("transcribes a waveform without sending it anywhere", async () => {
    const run = vi.fn(async () => ({ text: "  thank you for calling  " }));
    setSpeechPipelineFactory(async () => run);
    await expect(loadSpeechModel()).resolves.toMatchObject({ ready: true });
    await expect(transcribeLocal(new Float32Array([0.1, -0.1]))).resolves.toBe("thank you for calling");
    expect(run).toHaveBeenCalledOnce();
  });
});
