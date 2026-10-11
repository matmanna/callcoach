/** LAB ONLY. Calls to the lab API. Bodies contain scrubbed text or the template note only. */
import type { IdentifierCounts } from "@sc/rules";
import type { SendBody, SendResult } from "./pipeline.ts";

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

export async function sendToLab(body: SendBody, runId: string): Promise<SendResult> {
  const res = await fetch(`${API_BASE}/lab/redact/send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lab-run-id": runId },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as SendResult & { error?: string };
  if (res.status === 400) throw new Error("invalid_payload");
  return json;
}

export async function guardRemote(text: string): Promise<{ guard_counts: IdentifierCounts; comprehend: Record<string, number> | null }> {
  const res = await fetch(`${API_BASE}/lab/redact/guard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`guard ${res.status}`);
  return res.json();
}
