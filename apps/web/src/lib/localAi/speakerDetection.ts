/**
 * In-memory two-voice diarization for the local call flow.
 *
 * It uses short-time spectral shape, zero-crossing rate, and signal roughness to form an
 * acoustic profile. A caller calibrates the first profile; a sufficiently different voiced
 * segment establishes the other profile. Profiles contain only aggregate numbers, never audio
 * or transcript content, and exist only for the current call page.
 */
export type DetectedSpeaker = "volunteer" | "donor" | "unknown";

export interface VoiceProfile {
  readonly bands: readonly number[];
  readonly zeroCrossingRate: number;
  readonly roughness: number;
}

export interface SpeakerDetection {
  readonly speaker: DetectedSpeaker;
  readonly confidence: number;
  readonly voiced: boolean;
  readonly learnedOtherVoice: boolean;
}

const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 400;
const HOP_SAMPLES = 160;
const VOICE_RMS_FLOOR = 0.012;
const BAND_FREQUENCIES = [120, 200, 330, 520, 800, 1_200, 1_800, 2_600] as const;
const MATCH_THRESHOLD = 0.18;
const AMBIGUITY_MARGIN = 0.035;

function goertzelPower(frame: Float32Array, frequency: number): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE);
  let previous = 0;
  let previous2 = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const current = (frame[index] ?? 0) + coefficient * previous - previous2;
    previous2 = previous;
    previous = current;
  }
  return Math.max(0, previous2 * previous2 + previous * previous - coefficient * previous * previous2);
}

function normalise(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total ? values.map((value) => value / total) : values.map(() => 0);
}

/** Derive compact spectral features without retaining any input samples. */
export function voiceProfileFromAudio(audio: Float32Array): VoiceProfile | null {
  const bands = Array.from({ length: BAND_FREQUENCIES.length }, () => 0);
  let voicedFrames = 0;
  let zcrTotal = 0;
  let roughnessTotal = 0;

  for (let start = 0; start + FRAME_SAMPLES <= audio.length; start += HOP_SAMPLES) {
    const frame = audio.slice(start, start + FRAME_SAMPLES);
    let squareSum = 0;
    let differenceSum = 0;
    let crossings = 0;
    let previous = frame[0] ?? 0;
    for (let index = 0; index < frame.length; index += 1) {
      const sample = frame[index] ?? 0;
      squareSum += sample * sample;
      if (index > 0) {
        differenceSum += Math.abs(sample - previous);
        if ((sample >= 0) !== (previous >= 0)) crossings += 1;
      }
      previous = sample;
    }
    if (Math.sqrt(squareSum / frame.length) < VOICE_RMS_FLOOR) continue;
    voicedFrames += 1;
    zcrTotal += crossings / (frame.length - 1);
    roughnessTotal += differenceSum / (frame.length - 1);
    for (let index = 0; index < BAND_FREQUENCIES.length; index += 1) {
      const frequency = BAND_FREQUENCIES[index] ?? 0;
      bands[index] = (bands[index] ?? 0) + Math.log1p(goertzelPower(frame, frequency));
    }
  }

  if (!voicedFrames) return null;
  return {
    bands: normalise(bands),
    zeroCrossingRate: zcrTotal / voicedFrames,
    roughness: roughnessTotal / voicedFrames,
  };
}

function profileDistance(left: VoiceProfile, right: VoiceProfile): number {
  const bandDistance = left.bands.reduce((sum, band, index) => sum + Math.abs(band - (right.bands[index] ?? 0)), 0) / 2;
  const zcrDistance = Math.abs(left.zeroCrossingRate - right.zeroCrossingRate) / Math.max(left.zeroCrossingRate, right.zeroCrossingRate, 0.02);
  const roughnessDistance = Math.abs(left.roughness - right.roughness) / Math.max(left.roughness, right.roughness, VOICE_RMS_FLOOR);
  return 0.7 * bandDistance + 0.15 * zcrDistance + 0.15 * roughnessDistance;
}

function blendProfile(current: VoiceProfile, next: VoiceProfile, weight = 0.15): VoiceProfile {
  return {
    bands: current.bands.map((band, index) => band * (1 - weight) + (next.bands[index] ?? 0) * weight),
    zeroCrossingRate: current.zeroCrossingRate * (1 - weight) + next.zeroCrossingRate * weight,
    roughness: current.roughness * (1 - weight) + next.roughness * weight,
  };
}

function suggestion(speaker: DetectedSpeaker, distance: number, learnedOtherVoice: boolean): SpeakerDetection {
  return { speaker, confidence: Math.max(0, Math.min(1, 1 - distance / 0.45)), voiced: true, learnedOtherVoice };
}

/** Learns at most two session-scoped acoustic profiles. */
export class TwoVoiceDiarizer {
  private volunteer: VoiceProfile;
  private donor: VoiceProfile | null = null;
  private donorCandidate: VoiceProfile | null = null;

  constructor(volunteer: VoiceProfile) {
    this.volunteer = volunteer;
  }

  detect(audio: Float32Array): SpeakerDetection {
    const candidate = voiceProfileFromAudio(audio);
    if (!candidate) return { speaker: "unknown", confidence: 0, voiced: false, learnedOtherVoice: this.donor !== null };

    const volunteerDistance = profileDistance(candidate, this.volunteer);
    if (!this.donor) {
      if (volunteerDistance <= MATCH_THRESHOLD) {
        this.volunteer = blendProfile(this.volunteer, candidate);
        this.donorCandidate = null;
        return suggestion("volunteer", volunteerDistance, false);
      }
      if (!this.donorCandidate) {
        this.donorCandidate = candidate;
        return { speaker: "unknown", confidence: 0, voiced: true, learnedOtherVoice: false };
      }
      if (profileDistance(candidate, this.donorCandidate) <= MATCH_THRESHOLD) {
        this.donor = blendProfile(this.donorCandidate, candidate, 0.5);
        this.donorCandidate = null;
        return suggestion("donor", volunteerDistance, true);
      }
      this.donorCandidate = candidate;
      return { speaker: "unknown", confidence: 0, voiced: true, learnedOtherVoice: false };
    }

    const donorDistance = profileDistance(candidate, this.donor);
    if (Math.abs(volunteerDistance - donorDistance) < AMBIGUITY_MARGIN) {
      return { speaker: "unknown", confidence: 0, voiced: true, learnedOtherVoice: true };
    }
    if (volunteerDistance < donorDistance) {
      this.volunteer = blendProfile(this.volunteer, candidate);
      return suggestion("volunteer", volunteerDistance, true);
    }
    this.donor = blendProfile(this.donor, candidate);
    return suggestion("donor", donorDistance, true);
  }
}

/** Stateless helper retained for callers that only need a calibrated voice comparison. */
export function detectSpeaker(audio: Float32Array, volunteer: VoiceProfile): SpeakerDetection {
  return new TwoVoiceDiarizer(volunteer).detect(audio);
}
