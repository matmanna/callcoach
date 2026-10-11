import type { PlaceholderType } from "@sc/shared";

export type NerLabel = "PER" | "ORG" | "LOC" | "MISC";

/** Character offsets into the original (raw) string. Never leaves the browser. */
export interface NerEntity {
  start: number;
  end: number;
  label: NerLabel;
  score: number;
}

/** One raw per-token prediction, as returned by the Transformers.js pipeline with aggregation "none". */
export interface NerToken {
  entity: string;
  score: number;
  index: number;
  word: string;
}

export interface NerInterval {
  start: number;
  end: number;
  type: Extract<PlaceholderType, "NAME" | "TOWN" | "EMPLOYER">;
  label: NerLabel;
  score: number;
}

export const DEFAULT_NER_THRESHOLD = 0.85;
