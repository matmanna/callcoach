import { describe, expect, it } from "vitest";
import { mapEntities, tokensToEntities } from "../../src/lib/localAi/nerMapping.ts";
import type { NerEntity, NerToken } from "../../src/lib/localAi/nerTypes.ts";

const tok = (index: number, word: string, entity: string, score = 0.99): NerToken => ({ index, word, entity, score });

describe("tokensToEntities", () => {
  it("aligns WordPiece tokens to character offsets and groups BIO spans", () => {
    const text = "My nephew Kofi Mensah lives in Wexley.";
    const tokens = [
      tok(1, "My", "O"),
      tok(2, "nephew", "O"),
      tok(3, "Ko", "B-PER", 0.98),
      tok(4, "##fi", "I-PER", 0.96),
      tok(5, "Men", "I-PER", 0.97),
      tok(6, "##sah", "I-PER", 0.95),
      tok(7, "lives", "O"),
      tok(8, "in", "O"),
      tok(9, "We", "B-LOC", 0.9),
      tok(10, "##xley", "I-LOC", 0.88),
      tok(11, ".", "O"),
    ];
    const ents = tokensToEntities(text, tokens);
    expect(ents.map((e) => [text.slice(e.start, e.end), e.label])).toEqual([
      ["Kofi Mensah", "PER"],
      ["Wexley", "LOC"],
    ]);
    expect(ents[0]!.score).toBeCloseTo((0.98 + 0.96 + 0.97 + 0.95) / 4);
  });

  it("starts a new entity on B- and ignores continuations of O words", () => {
    const text = "Doris Albescu and Tom";
    const ents = tokensToEntities(text, [tok(1, "Doris", "B-PER"), tok(2, "Al", "B-PER"), tok(3, "##bes", "O"), tok(4, "##cu", "I-PER"), tok(5, "and", "O"), tok(6, "Tom", "B-PER")]);
    expect(ents.map((e) => text.slice(e.start, e.end))).toEqual(["Doris", "Albescu", "Tom"]);
  });

  it("skips tokens it cannot align without losing position", () => {
    const text = "Hi Ruth";
    expect(tokensToEntities(text, [tok(1, "Hi", "O"), tok(2, "[UNK]", "O"), tok(3, "Ruth", "B-PER")]).map((e) => e.start)).toEqual([3]);
  });
});

describe("mapEntities", () => {
  const text = "Brightpath Youth Alliance thanks Kofi in Wexley at Glenmore Plastics on Thanksgiving.";
  const at = (s: string) => text.indexOf(s);
  const ent = (s: string, label: NerEntity["label"], score = 0.99): NerEntity => ({ start: at(s), end: at(s) + s.length, label, score });

  it("maps PER/LOC/ORG to NAME/TOWN/EMPLOYER and drops MISC", () => {
    const m = mapEntities(text, [ent("Kofi", "PER"), ent("Wexley", "LOC"), ent("Glenmore Plastics", "ORG"), ent("Thanksgiving", "MISC")]);
    expect(m.used.map((u) => u.type)).toEqual(["NAME", "TOWN", "EMPLOYER"]);
    expect(m.misc).toHaveLength(1);
  });

  it("drops low-score entities (default threshold 0.85)", () => {
    const m = mapEntities(text, [ent("Kofi", "PER", 0.84), ent("Wexley", "LOC", 0.85)]);
    expect(m.used.map((u) => text.slice(u.start, u.end))).toEqual(["Wexley"]);
    expect(m.lowScore).toHaveLength(1);
    expect(mapEntities(text, [ent("Kofi", "PER", 0.6)], { threshold: 0.5 }).used).toHaveLength(1);
  });

  it("drops allowlisted entities case-insensitively, including parts of an allowlisted term", () => {
    const m = mapEntities(text, [ent("Brightpath Youth Alliance", "ORG"), ent("Brightpath", "ORG"), ent("Kofi", "PER")], { allowlist: ["brightpath youth alliance"] });
    expect(m.allowlisted).toHaveLength(2);
    expect(m.used.map((u) => u.type)).toEqual(["NAME"]);
  });
});
