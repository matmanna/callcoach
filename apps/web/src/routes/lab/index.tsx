/** LAB ONLY. Lab routes render only when LAB_ENABLED=1; otherwise they fall through to "Not found". */
import type { ReactNode } from "react";
import { RedactionLab } from "./redaction/RedactionLab.tsx";

export const LAB_ENABLED = import.meta.env.LAB_ENABLED === "1";

export function matchLabRoute(path: string): ReactNode | null {
  if (!LAB_ENABLED) return null;
  if (path === "/lab/redaction") return <RedactionLab />;
  return null;
}
