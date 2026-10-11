/**
 * LAB ONLY. Counts network requests made by this page since load, split into same-origin
 * (local files such as /models/) and outbound (any other origin). Wraps fetch and XHR, and
 * also watches Resource Timing so scripts, fonts, and wasm loads are seen too.
 */
export interface NetworkCounts {
  sameOrigin: number;
  outbound: number;
  outboundOrigins: string[];
}

const counts: NetworkCounts = { sameOrigin: 0, outbound: 0, outboundOrigins: [] };
const listeners = new Set<() => void>();
const seenResources = new Set<string>();
let installed = false;

function record(url: string, source: "fetch" | "xhr" | "resource") {
  let origin: string;
  try {
    origin = new URL(url, location.href).origin;
  } catch {
    return;
  }
  if (origin === "null" || url.startsWith("blob:") || url.startsWith("data:")) return;
  // Resource Timing also reports fetch/XHR; count those only once.
  const key = `${url}`;
  if (source === "resource") {
    if (seenResources.has(key)) return;
  } else seenResources.add(key);
  if (origin === location.origin) counts.sameOrigin += 1;
  else {
    counts.outbound += 1;
    if (!counts.outboundOrigins.includes(origin)) counts.outboundOrigins.push(origin);
  }
  listeners.forEach((l) => l());
}

export function installNetworkCounter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    record(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "fetch");
    return origFetch(input, init);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    record(String(url), "xhr");
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  for (const e of performance.getEntriesByType("resource")) seenResources.add(e.name);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) record(e.name, "resource");
    }).observe({ type: "resource", buffered: false });
  } catch {
    /* Resource Timing unavailable */
  }
}

export function networkCounts(): NetworkCounts {
  return { ...counts, outboundOrigins: [...counts.outboundOrigins] };
}

export function onNetworkChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetNetworkCounts(): void {
  counts.sameOrigin = 0;
  counts.outbound = 0;
  counts.outboundOrigins = [];
  listeners.forEach((l) => l());
}
