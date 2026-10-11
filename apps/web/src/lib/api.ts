/** Same-origin JSON client for /api (Vite proxies to the API in dev). Sends the session cookie. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? json.code ?? res.status), json);
  return json as T;
}

/** Human message for an API error; never echoes submitted values. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = err.body.issues as Array<{ path: string; message?: string }> | undefined;
    if (issues?.length) return issues.map((i) => `${i.path || "field"}: ${i.message ?? "invalid"}`).join("; ");
    const msg = typeof err.body.message === "string" ? err.body.message : null;
    return msg ?? err.code.replace(/_/g, " ");
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
