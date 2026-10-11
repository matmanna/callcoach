import { describe, expect, it } from "vitest";
import { detectSpeaker, mergeVoiceProfiles, smoothSpeakerLabel, voiceDistance, voiceProfileFromAudio } from "../../src/lib/localAi/speakerDetection.ts";

/** A voice-like tone: harmonics of f0 with a falling spectral tilt. `brightness` > 1 adds upper harmonics. */
function voice(f0: number, { amplitude = 0.12, seconds = 1.5, brightness = 1 } = {}): Float32Array {
  const rate = 16_000;
  return Float32Array.from({ length: rate * seconds }, (_, n) => {
    let s = 0;
    for (let h = 1; h <= 12; h += 1) s += (Math.pow(brightness, h > 4 ? 1 : 0) / h) * Math.sin((2 * Math.PI * h * f0 * n) / rate);
    return amplitude * s / 2.5;
  });
}

describe("speaker profile", () => {
  it("keeps only compact features, with band shares that sum to one", () => {
    const profile = voiceProfileFromAudio(voice(180));
    expect(profile).toBeTruthy();
    expect(Object.keys(profile!).sort()).toEqual(["bands", "centroidHz", "pitchHz"]);
    expect(profile!.bands).toHaveLength(8);
    expect(profile!.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("finds the fundamental of a voice within a few hertz", () => {
    expect(voiceProfileFromAudio(voice(150))!.pitchHz).toBeGreaterThan(145);
    expect(voiceProfileFromAudio(voice(150))!.pitchHz).toBeLessThan(155);
  });
});

describe("local speaker detection", () => {
  const volunteer = voiceProfileFromAudio(voice(180))!;

  it("recognizes the same voice even when it is quieter or further from the microphone", () => {
    expect(detectSpeaker(voice(180, { amplitude: 0.04 }), volunteer).speaker).toBe("volunteer");
    expect(detectSpeaker(voice(182), volunteer).speaker).toBe("volunteer");
  });

  it("labels a clearly different voice as donor, including a much higher or lower pitch", () => {
    expect(detectSpeaker(voice(110), volunteer).speaker).toBe("donor");
    expect(detectSpeaker(voice(260), volunteer).speaker).toBe("donor");
  });

  it("does not label silence as a speaker", () => {
    expect(detectSpeaker(new Float32Array(16_000), volunteer)).toEqual({ speaker: "unknown", confidence: 0, voiced: false });
  });

  it("measures distance as zero for the same voice and larger for a different one", () => {
    const same = voiceProfileFromAudio(voice(180, { amplitude: 0.05 }))!;
    const other = voiceProfileFromAudio(voice(120))!;
    expect(voiceDistance(volunteer, volunteer)).toBe(0);
    expect(voiceDistance(volunteer, same)).toBeLessThan(voiceDistance(volunteer, other));
  });
});

describe("speaker label smoothing", () => {
  it("follows the majority of recent labels and ignores unknown", () => {
    expect(smoothSpeakerLabel(["volunteer", "donor", "volunteer"])).toBe("volunteer");
    expect(smoothSpeakerLabel(["donor", "donor", "volunteer"])).toBe("donor");
    expect(smoothSpeakerLabel(["donor", "unknown", "unknown"])).toBe("donor");
    expect(smoothSpeakerLabel([])).toBe("unknown");
  });
});

describe("calibration", () => {
  it("merges several segments with median pitch so one odd clip does not dominate", () => {
    const profiles = [voiceProfileFromAudio(voice(180))!, voiceProfileFromAudio(voice(182))!, voiceProfileFromAudio(voice(260))!];
    const merged = mergeVoiceProfiles(profiles)!;
    expect(merged.pitchHz).toBeGreaterThan(175);
    expect(merged.pitchHz).toBeLessThan(190);
    expect(merged.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(mergeVoiceProfiles([])).toBeNull();
  });
});
