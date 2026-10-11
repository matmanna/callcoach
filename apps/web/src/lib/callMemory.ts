import type { LogFields } from "@sc/shared";

export interface DeviceCallDraft {
  donorId: string;
  logId: string;
  fields: LogFields;
  redactionCounts: Record<string, number>;
  segmentCount: number;
  nerBackend: string;
}

const calls = new Map<string, DeviceCallDraft>();

export function keepCallDraft(draft: DeviceCallDraft): void {
  calls.set(draft.logId, draft);
}

/** One read only: navigating to post-call consumes the device-memory handoff. */
export function consumeCallDraft(logId: string): DeviceCallDraft | null {
  const draft = calls.get(logId) ?? null;
  calls.delete(logId);
  return draft;
}
