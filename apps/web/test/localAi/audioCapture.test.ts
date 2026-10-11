import { describe, expect, it } from "vitest";
import { resampleTo16k } from "../../src/lib/localAi/audioCapture.ts";

describe("resampleTo16k", () => {
  it("copies 16 kHz input without sharing its buffer", () => {
    const input = new Float32Array([0, 0.5, -0.5]);
    const output = resampleTo16k(input, 16_000);
    expect([...output]).toEqual([...input]);
    expect(output).not.toBe(input);
  });

  it("downsamples by averaging source windows", () => {
    const output = resampleTo16k(new Float32Array([0, 1, 0, 1]), 32_000);
    expect([...output]).toEqual([0.5, 0.5]);
  });
});
