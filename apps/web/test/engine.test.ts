import { describe, expect, it, vi } from "vitest";
import type { RawTurn } from "@sc/shared";
import { engineReducer, initialEngineState } from "../src/lab/turns/engine.ts";
import { TranscriptDriver } from "../src/lab/turns/driver.ts";
const turn = (id: string, t: number): RawTurn => ({ id, t, speaker: "donor", raw: "synthetic" });
describe("lab playback state", () => {
  it("requires consent before live, steps one turn only while paused, and reset clears state", () => {
    let state = engineReducer(initialEngineState, { type: "START" }); expect(state.phase).toBe("IDLE");
    state = engineReducer(state, { type: "CONSENT", checked: true }); state = engineReducer(state, { type: "START" }); expect(state.phase).toBe("LIVE");
    state = engineReducer(state, { type: "PAUSE" }); state = engineReducer(state, { type: "STEP", turn: turn("one", 0) }); expect(state.emitted).toHaveLength(1);
    state = engineReducer(state, { type: "STEP", turn: turn("two", 1) }); expect(state.emitted).toHaveLength(2);
    expect(engineReducer(state, { type: "RESET" })).toEqual(initialEngineState);
  });
  it("driver emits turns at elapsed times scaled by playback speed", () => {
    vi.useFakeTimers(); let now = 0; const emitted: string[] = [];
    const driver = new TranscriptDriver([turn("zero", 0), turn("later", 1000)], (t) => emitted.push(t.id), () => now);
    driver.start(); driver.tick(); expect(emitted).toEqual(["zero"]); driver.setSpeed(10); now += 100; driver.tick(); expect(emitted).toEqual(["zero", "later"]); vi.useRealTimers();
  });
});
