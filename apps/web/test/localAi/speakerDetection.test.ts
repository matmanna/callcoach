import { describe, expect, it } from "vitest";
import { detectSpeaker, voiceProfileFromAudio } from "../../src/lib/localAi/speakerDetection.ts";

function tone(frequency: number, amplitude = 0.12, seconds = 1): Float32Array {
  const samples = 16_000 * seconds;
  return Float32Array.from({ length: samples }, (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / 16_000));
}

describe("local speaker detection", () => {
  it("creates a compact profile without retaining the audio buffer", () => {
    const audio = tone(180);
    const profile = voiceProfileFromAudio(audio);
    expect(profile).toBeTruthy();
    expect(profile).not.toBe(audio);
    expect(Object.keys(profile ?? {}).sort()).toEqual(["rms", "roughness", "zeroCrossingRate"]);
  });

  it("recognizes a close local voice and flags a dissimilar one for review", () => {
    const profile = voiceProfileFromAudio(tone(180));
    expect(profile).toBeTruthy();
    expect(detectSpeaker(tone(185), profile!).speaker).toBe("volunteer");
    expect(detectSpeaker(tone(1_100), profile!).speaker).toBe("donor");
  });

  it("does not label silence as a speaker", () => {
    const profile = voiceProfileFromAudio(tone(180));
    expect(detectSpeaker(new Float32Array(16_000), profile!)).toEqual({ speaker: "unknown", confidence: 0, voiced: false });
  });
});
