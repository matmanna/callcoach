import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api.ts";

/** GET helper with reload. Pass null to skip. Stale responses from an older path are ignored. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const latest = useRef(path);
  latest.current = path;
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const res = await api<T>(path);
      if (latest.current === path) (setData(res), setError(null));
    } catch (err) {
      if (latest.current === path) setError(errorMessage(err));
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}
