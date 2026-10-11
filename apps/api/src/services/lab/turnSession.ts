import type { LabMode, Turn } from "@sc/shared";
import type { CueState } from "@sc/rules";
import { initialCueState } from "@sc/rules";

export interface LabEventRecord { seq: number; type: string; data: Record<string, unknown>; at: number }
export interface WireRecord { kind: string; turn_id?: string; bytes: number; status: number; ms: number; retries: number; at: number; detail?: Record<string, unknown> }
export interface BedrockRecord { mode: string; status: string; mock: boolean; latency_ms: number; response_latency_ms: number | null; input_tokens: number; output_tokens: number; at: number; detail?: Record<string, unknown> }
export interface LabSession {
  call_id: string; donor_id: string; mode: LabMode; cueState: CueState; turns: Turn[]; events: LabEventRecord[]; seq: number;
  bedrockCalls: number; idempotent: Map<string, unknown>; firedRuleIds: string[]; wire: WireRecord[]; bedrock: BedrockRecord[]; createdAt: number; touchedAt: number;
}
const TTL_MS = 60 * 60 * 1000;
export const sessions = new Map<string, LabSession>();
const ttlReaper = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) if (now - session.touchedAt > TTL_MS) sessions.delete(id);
}, 60_000);
ttlReaper.unref?.();
export function createSession(call_id: string, donor_id: string, mode: LabMode): LabSession {
  const now = Date.now();
  const session: LabSession = { call_id, donor_id, mode, cueState: initialCueState(), turns: [], events: [], seq: 0, bedrockCalls: 0, idempotent: new Map(), firedRuleIds: [], wire: [], bedrock: [], createdAt: now, touchedAt: now };
  sessions.set(call_id, session); return session;
}
export function getSession(id: string): LabSession | undefined {
  const value = sessions.get(id); if (value && Date.now() - value.touchedAt > TTL_MS) { sessions.delete(id); return undefined; }
  if (value) value.touchedAt = Date.now(); return value;
}
export function appendEvent(s: LabSession, type: string, data: Record<string, unknown>): LabEventRecord {
  const event = { seq: ++s.seq, type, data, at: Date.now() }; s.events.push(event); return event;
}
