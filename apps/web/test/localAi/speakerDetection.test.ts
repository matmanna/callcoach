import { describe, expect, it } from "vitest";
import { TwoVoiceDiarizer, voiceProfileFromAudio } from "../../src/lib/localAi/speakerDetection.ts";

function voice(frequencies: readonly number[], seconds = 1): Float32Array {
  const samples = 16_000 * seconds;
  return Float32Array.from({ length: samples }, (_, index) => frequencies.reduce((sum, frequency, voiceIndex) => sum + (0.1 / (voiceIndex + 1)) * Math.sin((2 * Math.PI * frequency * index) / 16_000), 0));
}

describe("local two-voice diarization", () => {
  it("creates a compact profile without retaining the audio buffer", () => {
    const audio = voice([180, 460]);
    const profile = voiceProfileFromAudio(audio);
    expect(profile).toBeTruthy();
    expect(profile).not.toBe(audio);
    expect(profile?.bands).toHaveLength(8);
  });

  it("learns and consistently distinguishes two local voices", () => {
    const volunteer = voice([180, 460]);
    const donor = voice([310, 1_100]);
    const profile = voiceProfileFromAudio(volunteer);
    expect(profile).toBeTruthy();
    const diarizer = new TwoVoiceDiarizer(profile!);
    expect(diarizer.detect(volunteer).speaker).toBe("volunteer");
    expect(diarizer.detect(donor).speaker).toBe("unknown");
    expect(diarizer.detect(donor)).toMatchObject({ speaker: "donor", learnedOtherVoice: true });
    expect(diarizer.detect(volunteer).speaker).toBe("volunteer");
    expect(diarizer.detect(donor).speaker).toBe("donor");
  });

  it("does not label silence as a speaker", () => {
    const profile = voiceProfileFromAudio(voice([180, 460]));
    expect(new TwoVoiceDiarizer(profile!).detect(new Float32Array(16_000))).toMatchObject({ speaker: "unknown", confidence: 0, voiced: false });
  });
});
