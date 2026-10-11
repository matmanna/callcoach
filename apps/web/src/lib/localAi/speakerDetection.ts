/**
 * Session-only speaker matching for local call capture.
 *
 * A volunteer explicitly calibrates their own voice from one microphone segment. The resulting
 * compact acoustic signature is held in memory only and compared with later microphone segments.
 * It is neither a recording nor an identifier, and is cleared when the call ends. A single
 * microphone cannot prove who is speaking, so callers can always override the proposed label.
 */
export type DetectedSpeaker = "volunteer" | "donor" | "unknown";

export interface VoiceProfile {
  readonly rms: number;
  readonly zeroCrossingRate: number;
  readonly roughness: number;
}

export interface SpeakerDetection {
  readonly speaker: DetectedSpeaker;
  readonly confidence: number;
  readonly voiced: boolean;
}

const FRAME_SAMPLES = 400; // 25 ms at the 16 kHz capture rate
const VOICE_RMS_FLOOR = 0.012;

/** Derive three aggregate audio features; the input buffer is not retained. */
export function voiceProfileFromAudio(audio: Float32Array): VoiceProfile | null {
  let voicedFrames = 0;
  let rmsTotal = 0;
  let zcrTotal = 0;
  let roughnessTotal = 0;

  for (let start = 0; start + FRAME_SAMPLES <= audio.length; start += FRAME_SAMPLES) {
    let squareSum = 0;
    let differenceSum = 0;
    let crossings = 0;
    let previous = audio[start] ?? 0;
    for (let index = start; index < start + FRAME_SAMPLES; index += 1) {
      const sample = audio[index] ?? 0;
      squareSum += sample * sample;
      if (index > start) {
        differenceSum += Math.abs(sample - previous);
        if ((sample >= 0) !== (previous >= 0)) crossings += 1;
      }
      previous = sample;
    }
    const rms = Math.sqrt(squareSum / FRAME_SAMPLES);
    if (rms < VOICE_RMS_FLOOR) continue;
    voicedFrames += 1;
    rmsTotal += rms;
    zcrTotal += crossings / (FRAME_SAMPLES - 1);
    roughnessTotal += differenceSum / (FRAME_SAMPLES - 1);
  }

  if (!voicedFrames) return null;
  return {
    rms: rmsTotal / voicedFrames,
    zeroCrossingRate: zcrTotal / voicedFrames,
    roughness: roughnessTotal / voicedFrames,
  };
}

/**
 * Match a live segment against a caller's in-memory calibration. This is a suggestion only:
 * `unknown` is returned for silence, while dissimilar voiced audio is labelled as likely donor.
 */
export function detectSpeaker(audio: Float32Array, volunteer: VoiceProfile): SpeakerDetection {
  const candidate = voiceProfileFromAudio(audio);
  if (!candidate) return { speaker: "unknown", confidence: 0, voiced: false };

  const distance = (
    Math.abs(candidate.rms - volunteer.rms) / Math.max(volunteer.rms, VOICE_RMS_FLOOR)
    + Math.abs(candidate.zeroCrossingRate - volunteer.zeroCrossingRate) / Math.max(volunteer.zeroCrossingRate, 0.02)
    + Math.abs(candidate.roughness - volunteer.roughness) / Math.max(volunteer.roughness, VOICE_RMS_FLOOR)
  ) / 3;
  const confidence = Math.max(0, Math.min(1, 1 - distance));
  return {
    speaker: distance <= 0.35 ? "volunteer" : "donor",
    confidence,
    voiced: true,
  };
}
