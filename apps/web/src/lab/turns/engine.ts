import type { RawTurn, Turn } from "@sc/shared";

export type Phase = "IDLE" | "CONSENTED" | "LIVE" | "PAUSED" | "ENDED";
export interface EngineState { phase: Phase; emitted: RawTurn[]; cursor: number }
export type EngineEvent =
  | { type: "CONSENT"; checked: boolean }
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "TICK"; turn?: RawTurn }
  | { type: "STEP"; turn?: RawTurn }
  | { type: "END" }
  | { type: "RESET" };
export const initialEngineState: EngineState = { phase: "IDLE", emitted: [], cursor: 0 };
export function engineReducer(state: EngineState, event: EngineEvent): EngineState {
  switch (event.type) {
    case "CONSENT": return state.phase === "IDLE" && event.checked ? { ...state, phase: "CONSENTED" } : state.phase === "CONSENTED" && !event.checked ? { ...state, phase: "IDLE" } : state;
    case "START": return state.phase === "CONSENTED" ? { ...state, phase: "LIVE" } : state;
    case "PAUSE": return state.phase === "LIVE" ? { ...state, phase: "PAUSED" } : state;
    case "RESUME": return state.phase === "PAUSED" ? { ...state, phase: "LIVE" } : state;
    case "TICK": return state.phase === "LIVE" && event.turn ? { ...state, emitted: [...state.emitted, event.turn], cursor: state.cursor + 1 } : state;
    case "STEP": return state.phase === "PAUSED" && event.turn ? { ...state, emitted: [...state.emitted, event.turn], cursor: state.cursor + 1 } : state;
    case "END": return ["CONSENTED", "LIVE", "PAUSED"].includes(state.phase) ? { ...state, phase: "ENDED" } : state;
    case "RESET": return initialEngineState;
  }
}
export interface LocalCue { rule_id: string; type: string; tag?: string; dnc_candidate: boolean }
export interface DisplayTurn { raw: RawTurn; turn: Turn; localCue: LocalCue | null; serverCue: LocalCue | null; emittedAt: number; arrivedAt?: number; bedrock?: { value: unknown; arrivedAt: number; mock: boolean } }
