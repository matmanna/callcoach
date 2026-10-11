import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmtDateTime } from "./bits";

/**
 * Coordinator card for the organization join code. The code appears once, right after it is made,
 * with a copy button. Afterwards only "active" and the rotation time are shown.
 */
export function JoinCodeCard() {
  const { data, error, reload } = useApi<{ active: boolean; rotated_at: string | null }>("/org/join-code");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rotate = async () => {
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/org/join-code/rotate", { body: {} });
      setCode(r.code);
      reload();
      toast.success("New join code ready. Copy it now; it is shown once.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4" aria-hidden="true" />
          Join code
          {data ? <Badge variant={data.active ? "secondary" : "outline"}>{data.active ? "Active" : "Not set"}</Badge> : null}
        </CardTitle>
        <CardDescription>
          Volunteers enter this on their first sign-in to join your main team as callers. Rotating it stops the old code at once.
          {data?.rotated_at ? ` Last rotated ${fmtDateTime(data.rotated_at)}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {code ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#ebe6f7] p-3">
            <code className="font-mono text-2xl tracking-[0.2em] text-[#4f3f86]">{code}</code>
            <Button
              size="sm"
              variant="outline"
              className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => void navigator.clipboard?.writeText(code).then(() => toast.success("Copied"), () => toast.error("Copy blocked. Select the code and copy it."))}
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        ) : null}
        <Button onClick={rotate} disabled={busy} className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <RefreshCw className="size-4" />
          {data?.active ? "Rotate code" : "Generate code"}
        </Button>
      </CardContent>
    </Card>
  );
}
