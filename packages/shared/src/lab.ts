import { z } from "zod";
import { FlagLabel } from "./enums.ts";
import { Turn } from "./schemas.ts";

export const LabMode = z.enum(["rules_only", "rules_end", "rules_rolling"]);
export type LabMode = z.infer<typeof LabMode>;
export const LabTurnRequest = z.strictObject({ idempotency_key: z.string().min(1), turn: Turn });
export const LabCue = z.object({ rule_id: z.string(), type: z.string(), tag: z.string().optional(), dnc_candidate: z.boolean() });
export const LabTurnResponse = z.object({ seq: z.number().int(), cue: LabCue.nullable(), server_ms: z.number() });
export const LabEvent = z.object({ seq: z.number().int(), type: z.string(), data: z.record(z.string(), z.unknown()), at: z.number() });
export const LabFlagResult = z.strictObject({ label: FlagLabel.nullable(), reason: z.string().max(160) });
