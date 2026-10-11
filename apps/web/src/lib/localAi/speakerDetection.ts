/**
 * Session-only speaker matching for local call capture.
 *
 * A volunteer calibrates their own voice once, from a short local sample. The result is a compact
 * acoustic profile (pitch, brightness, and spectral balance). The donor's voice is learned during the
 * call from the segments that do not match the volunteer. Profiles hold only aggregate numbers, never
 * audio or transcript text. They live in memory for the call, and in Tauri the volunteer's profile
 * can be kept on this device for later calls. One microphone cannot prove who is speaking, so callers
 * can always override a label.
 *
 * Why these features: pitch and spectral balance differ much more between people than loudness
 * does, and both survive a change in microphone distance. Loudness is used only to skip silence.
 */
export type DetectedSpeaker = "volunteer" | "donor" | "unknown";

export interface VoiceProfile {
  /** Median fundamental frequency in Hz over voiced windows. */
  readonly pitchHz: number;
  /** Median spectral centroid in Hz. */
  readonly centroidHz: number;
  /** Share of spectral energy per band, low to high. Sums to 1. Loudness-independent. */
  readonly bands: readonly number[];
}

export interface SpeakerDetection {
  readonly speaker: DetectedSpeaker;
  readonly confidence: number;
  readonly voiced: boolean;
  /** True once a second voice (the donor's) has been learned for this call. */
  readonly learnedOtherVoice?: boolean;
}

export const SAMPLE_RATE = 16_000;
const WINDOW = 1024; // 64 ms at 16 kHz: two periods of the lowest voice (about 70 Hz)
const HOP = 512;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
const VOICE_RMS_FLOOR = 0.01;
const CLARITY_FLOOR = 0.5; // normalized autocorrelation peak needed to trust a pitch estimate
const BAND_EDGES_HZ = [100, 250, 500, 800, 1_200, 2_000, 3_500, 5_500, 8_000] as const;
const BANDS = BAND_EDGES_HZ.length - 1;

/** Decision thresholds on the combined distance (0 = identical). Tuned on synthetic voices in the tests. */
export const SAME_VOICE_MAX = 0.35;
export const DIFFERENT_VOICE_MIN = 0.6;
/** Two profiles this close are treated as the same voice when a donor is being learned. */
const AMBIGUITY_MARGIN = 0.04;

const hann = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)));

/** In-place iterative radix-2 FFT. `re` and `im` have length WINDOW. */
function fft(re: Float64Array, im: Float64Array): void {
  for (let i = 1, j = 0; i < WINDOW; i += 1) {
    let bit = WINDOW >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= WINDOW; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < WINDOW; start += size) {
      for (let k = 0; k < size / 2; k += 1) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/** Normalized autocorrelation pitch estimate for one window. Returns null for unvoiced or unclear audio. */
function pitchOf(frame: Float64Array): number | null {
  const minLag = Math.floor(SAMPLE_RATE / MAX_PITCH_HZ);
  const maxLag = Math.ceil(SAMPLE_RATE / MIN_PITCH_HZ);
  const correlation = new Float64Array(maxLag + 2);
  let energy0 = 0;
  for (let i = 0; i < frame.length; i += 1) energy0 += frame[i]! * frame[i]!;
  if (energy0 === 0) return null;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let num = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < frame.length; i += 1) {
      num += frame[i]! * frame[i + lag]!;
      e1 += frame[i]! * frame[i]!;
      e2 += frame[i + lag]! * frame[i + lag]!;
    }
    const norm = Math.sqrt(e1 * e2);
    correlation[lag] = norm > 0 ? num / norm : 0;
    best = Math.max(best, correlation[lag]!);
  }
  if (best < CLARITY_FLOOR) return null;
  // Octave correction: a strong subharmonic peak can beat the true period (260 Hz read as 130 Hz).
  // Take the shortest lag whose peak is nearly as strong as the best one.
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const r = correlation[lag]!;
    if (r >= 0.9 * best && r >= correlation[lag - 1]! && r >= correlation[lag + 1]!) return SAMPLE_RATE / lag;
  }
  let bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag += 1) if (correlation[lag]! > correlation[bestLag]!) bestLag = lag;
  return SAMPLE_RATE / bestLag;
}

interface WindowFeatures {
  pitchHz: number;
  centroidHz: number;
  bands: number[];
}

function featuresOf(frame: Float64Array): WindowFeatures | null {
  const rms = Math.sqrt(frame.reduce((sum, x) => sum + x * x, 0) / frame.length);
  if (rms < VOICE_RMS_FLOOR) return null;
  const pitch = pitchOf(frame);
  if (pitch === null) return null;

  const re = Float64Array.from(frame, (x, i) => x * hann[i]!);
  const im = new Float64Array(WINDOW);
  fft(re, im);
  const binHz = SAMPLE_RATE / WINDOW;
  const energy = new Array<number>(BANDS).fill(0);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < WINDOW / 2; k += 1) {
    const hz = k * binHz;
    const power = re[k]! * re[k]! + im[k]! * im[k]!;
    weighted += hz * power;
    total += power;
    for (let b = 0; b < BANDS; b += 1) {
      if (hz >= BAND_EDGES_HZ[b]! && hz < BAND_EDGES_HZ[b + 1]!) energy[b]! += power;
    }
  }
  if (total === 0) return null;
  const bandTotal = energy.reduce((a, b) => a + b, 0);
  if (bandTotal === 0) return null;
  return { pitchHz: pitch, centroidHz: weighted / total, bands: energy.map((e) => e / bandTotal) };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Profile from one audio segment. The input buffer is not retained. Null when no voiced audio is found. */
export function voiceProfileFromAudio(audio: Float32Array): VoiceProfile | null {
  const frames: WindowFeatures[] = [];
  for (let start = 0; start + WINDOW <= audio.length; start += HOP) {
    const f = featuresOf(Float64Array.from(audio.subarray(start, start + WINDOW)));
    if (f) frames.push(f);
  }
  if (!frames.length) return null;
  const bands = Array.from({ length: BANDS }, (_, b) => frames.reduce((s, f) => s + f.bands[b]!, 0) / frames.length);
  const total = bands.reduce((a, b) => a + b, 0);
  return {
    pitchHz: median(frames.map((f) => f.pitchHz)),
    centroidHz: median(frames.map((f) => f.centroidHz)),
    bands: bands.map((b) => b / total),
  };
}

/**
 * Distance between a segment and the calibrated voice. Pitch counts most (in semitones, 2 semitones = 1),
 * then brightness, then the spectral balance (half the L1 distance of the band shares).
 */
export function voiceDistance(a: VoiceProfile, b: VoiceProfile): number {
  const pitch = Math.min(1, Math.abs(12 * Math.log2(a.pitchHz / b.pitchHz)) / 2);
  const centroid = Math.min(1, Math.abs(a.centroidHz - b.centroidHz) / Math.max(b.centroidHz, 1));
  const bands = a.bands.reduce((sum, x, i) => sum + Math.abs(x - (b.bands[i] ?? 0)), 0) / 2;
  return 0.5 * pitch + 0.2 * centroid + 0.3 * bands;
}

/**
 * Match a live segment against the calibrated volunteer voice. A suggestion only: silence is `unknown`,
 * a voice close to the volunteer is `volunteer`, one clearly different is `donor`, and anything in between
 * is `unknown` so the caller decides.
 */
export function detectSpeaker(audio: Float32Array, volunteer: VoiceProfile): SpeakerDetection {
  const candidate = voiceProfileFromAudio(audio);
  if (!candidate) return { speaker: "unknown", confidence: 0, voiced: false };
  const distance = voiceDistance(candidate, volunteer);
  const confidence = Math.max(0, Math.min(1, 1 - distance));
  if (distance <= SAME_VOICE_MAX) return { speaker: "volunteer", confidence, voiced: true };
  if (distance >= DIFFERENT_VOICE_MIN) return { speaker: "donor", confidence, voiced: true };
  return { speaker: "unknown", confidence, voiced: true };
}

/**
 * Smooths labels over the last few voiced segments, so one noisy segment does not flip the label.
 * Majority of the recent labels that are not `unknown`. Keeps only labels, never audio.
 */
export function smoothSpeakerLabel(recent: readonly DetectedSpeaker[], window = 3): DetectedSpeaker {
  const votes = recent.slice(-window).filter((s) => s !== "unknown");
  if (!votes.length) return "unknown";
  const volunteer = votes.filter((s) => s === "volunteer").length;
  const donor = votes.length - volunteer;
  if (volunteer === donor) return votes[votes.length - 1]!;
  return volunteer > donor ? "volunteer" : "donor";
}

/** Combines calibration segments into one profile: median pitch and brightness, mean band shares. */
export function mergeVoiceProfiles(profiles: readonly VoiceProfile[]): VoiceProfile | null {
  if (!profiles.length) return null;
  const bands = Array.from({ length: BANDS }, (_, b) => profiles.reduce((s, p) => s + (p.bands[b] ?? 0), 0) / profiles.length);
  const total = bands.reduce((a, b) => a + b, 0);
  return {
    pitchHz: median(profiles.map((p) => p.pitchHz)),
    centroidHz: median(profiles.map((p) => p.centroidHz)),
    bands: bands.map((b) => b / total),
  };
}

const PROFILE_KEY = "stewardship-copilot.voice-profile.v2";
const profileKey = (userId: string) => `${PROFILE_KEY}.${userId}`;
const isDesktop = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isProfile = (value: unknown): value is VoiceProfile => {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<VoiceProfile>;
  return (
    typeof p.pitchHz === "number" && Number.isFinite(p.pitchHz) && p.pitchHz >= MIN_PITCH_HZ && p.pitchHz <= MAX_PITCH_HZ
    && typeof p.centroidHz === "number" && Number.isFinite(p.centroidHz)
    && Array.isArray(p.bands) && p.bands.length === BANDS && p.bands.every((b) => typeof b === "number" && Number.isFinite(b))
  );
};

/** Desktop only: the volunteer's compact profile, kept on this device. Audio and transcript text are never stored. */
export function loadStoredVoiceProfile(userId: string): VoiceProfile | null {
  if (!isDesktop()) return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(profileKey(userId)) ?? "null");
    return isProfile(value) ? { pitchHz: value.pitchHz, centroidHz: value.centroidHz, bands: [...value.bands] } : null;
  } catch {
    return null;
  }
}

export function saveVoiceProfile(userId: string, profile: VoiceProfile): void {
  if (isDesktop()) window.localStorage.setItem(profileKey(userId), JSON.stringify(profile));
}

export function clearStoredVoiceProfile(userId: string): void {
  if (isDesktop()) window.localStorage.removeItem(profileKey(userId));
}

/**
 * Pitch and brightness only. Band shares move a lot between segments, so they are left out when
 * deciding whether two segments come from the same person.
 */
export function sameVoiceStable(a: VoiceProfile, b: VoiceProfile): boolean {
  const semitones = Math.abs(12 * Math.log2(a.pitchHz / b.pitchHz));
  const brightness = Math.abs(a.centroidHz - b.centroidHz) / Math.max(b.centroidHz, 1);
  return semitones <= 1.5 && brightness <= 0.15;
}

const blend = (current: VoiceProfile, next: VoiceProfile, weight: number): VoiceProfile => ({
  pitchHz: current.pitchHz * (1 - weight) + next.pitchHz * weight,
  centroidHz: current.centroidHz * (1 - weight) + next.centroidHz * weight,
  bands: current.bands.map((b, i) => b * (1 - weight) + (next.bands[i] ?? 0) * weight),
});

/**
 * Two-voice diarization for one call. The volunteer profile comes from calibration. A voiced segment
 * that does not match it starts a donor candidate. A second segment that matches the candidate
 * confirms the donor voice. After that each segment goes to whichever profile is nearer, or is
 * left `unknown` when the two are about equally close.
 */
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

    const toVolunteer = voiceDistance(candidate, this.volunteer);
    let speaker: DetectedSpeaker;
    let distance: number;
    if (!this.donor) {
      if (toVolunteer <= SAME_VOICE_MAX) {
        speaker = "volunteer";
        distance = toVolunteer;
        // Gentle drift correction while the volunteer keeps speaking.
        this.volunteer = blend(this.volunteer, candidate, 0.1);
      } else {
        // Not the volunteer: provisional donor until a second matching segment confirms it.
        speaker = "donor";
        distance = toVolunteer;
        if (this.donorCandidate && sameVoiceStable(candidate, this.donorCandidate)) {
          this.donor = blend(this.donorCandidate, candidate, 0.5);
          this.donorCandidate = null;
        } else {
          this.donorCandidate = candidate;
        }
      }
    } else {
      const toDonor = voiceDistance(candidate, this.donor);
      distance = Math.min(toVolunteer, toDonor);
      if (Math.abs(toVolunteer - toDonor) < AMBIGUITY_MARGIN && distance > SAME_VOICE_MAX) speaker = "unknown";
      else speaker = toVolunteer <= toDonor ? "volunteer" : "donor";
      if (speaker === "volunteer") this.volunteer = blend(this.volunteer, candidate, 0.05);
      if (speaker === "donor") this.donor = blend(this.donor, candidate, 0.05);
    }

    // Each turn is judged on its own. Smoothing would hold the old speaker through a real turn change.
    return {
      speaker,
      confidence: Math.max(0, Math.min(1, 1 - distance)),
      voiced: true,
      learnedOtherVoice: this.donor !== null,
    };
  }
}
