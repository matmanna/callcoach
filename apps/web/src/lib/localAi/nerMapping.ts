/** Pure NER post-processing: token alignment, BIO grouping, label mapping, allowlist. */
import type { NerEntity, NerInterval, NerLabel, NerToken } from "./nerTypes.ts";
import { DEFAULT_NER_THRESHOLD } from "./nerTypes.ts";

const LABELS: readonly NerLabel[] = ["PER", "ORG", "LOC", "MISC"];

function parseTag(entity: string): { prefix: "B" | "I" | "O"; label: NerLabel | null } {
  if (entity === "O") return { prefix: "O", label: null };
  const m = /^([BIES])-(.+)$/.exec(entity);
  const label = (m ? m[2] : entity) as NerLabel;
  const prefix = m && (m[1] === "B" || m[1] === "S") ? "B" : "I";
  return { prefix, label: LABELS.includes(label) ? label : null };
}

/**
 * Convert per-token predictions to entities with character offsets on the original string.
 * Transformers.js does not return offsets, so tokens (all of them, including "O") are aligned
 * left to right against the text. WordPiece continuations ("##x") join the previous word.
 */
export function tokensToEntities(text: string, tokens: readonly NerToken[]): NerEntity[] {
  const lower = text.toLowerCase();
  const sorted = [...tokens].sort((a, b) => a.index - b.index);
  const entities: NerEntity[] = [];
  let cursor = 0;
  let open: (NerEntity & { scores: number[] }) | null = null;
  let prevWordInEntity = false;

  const close = () => {
    if (open) {
      const { scores, ...e } = open;
      entities.push({ ...e, score: scores.reduce((a, b) => a + b, 0) / scores.length });
    }
    open = null;
  };

  for (const tok of sorted) {
    const continuation = tok.word.startsWith("##");
    const piece = continuation ? tok.word.slice(2) : tok.word;
    if (!piece || piece === "[UNK]") continue;
    const at = lower.indexOf(piece.toLowerCase(), cursor);
    if (at < 0) continue;
    const start = at;
    const end = at + piece.length;
    cursor = end;

    if (continuation) {
      // A word's label comes from its first piece; later pieces only extend it.
      const current = open as (NerEntity & { scores: number[] }) | null;
      if (current && prevWordInEntity) {
        current.end = end;
        current.scores.push(tok.score);
      }
      continue;
    }
    const { prefix, label } = parseTag(tok.entity);
    if (!label) {
      close();
      prevWordInEntity = false;
      continue;
    }
    const current = open as (NerEntity & { scores: number[] }) | null;
    if (current && prefix === "I" && current.label === label) {
      current.end = end;
      current.scores.push(tok.score);
    } else {
      close();
      open = { start, end, label, score: 0, scores: [tok.score] };
    }
    prevWordInEntity = true;
  }
  close();
  return entities;
}

const PLACEHOLDER: Record<Exclude<NerLabel, "MISC">, NerInterval["type"]> = { PER: "NAME", LOC: "TOWN", ORG: "EMPLOYER" };

export interface MapOptions {
  threshold?: number;
  allowlist?: readonly string[];
}

export interface MappedEntities {
  used: NerInterval[];
  allowlisted: NerEntity[];
  lowScore: NerEntity[];
  misc: NerEntity[];
}

/**
 * PER -> [NAME], LOC -> [TOWN], ORG -> [EMPLOYER]. MISC is ignored. Entities below the score
 * threshold are dropped. Entities whose text matches an allowlist term (case-insensitive), or
 * sits inside an allowlisted occurrence, are dropped.
 */
export function mapEntities(text: string, entities: readonly NerEntity[], opts: MapOptions = {}): MappedEntities {
  const threshold = opts.threshold ?? DEFAULT_NER_THRESHOLD;
  const lower = text.toLowerCase();
  const allowRanges: Array<[number, number]> = [];
  for (const term of opts.allowlist ?? []) {
    const t = term.toLowerCase();
    for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + 1)) allowRanges.push([i, i + t.length]);
  }
  const out: MappedEntities = { used: [], allowlisted: [], lowScore: [], misc: [] };
  for (const e of entities) {
    if (e.label === "MISC") {
      out.misc.push(e);
      continue;
    }
    if (e.score < threshold) {
      out.lowScore.push(e);
      continue;
    }
    if (allowRanges.some(([s, en]) => e.start >= s && e.end <= en)) {
      out.allowlisted.push(e);
      continue;
    }
    out.used.push({ start: e.start, end: e.end, type: PLACEHOLDER[e.label], label: e.label, score: e.score });
  }
  return out;
}
