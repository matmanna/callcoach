import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

/** A count that is shown or suppressed. The server sends no number for a suppressed cell. */
export type Cell = { suppressed: true } | { n: number };

export const SUPPRESSED_TEXT = "suppressed (under 5)";

export function CellText({ cell }: { cell: Cell | number | null | undefined | { suppressed: true } }) {
  if (cell === null || cell === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof cell === "number") return <span>{cell}</span>;
  if ("suppressed" in cell) return <span className="text-muted-foreground italic">{SUPPRESSED_TEXT}</span>;
  return <span>{cell.n}</span>;
}

/** Numeric value of a shown cell, or undefined when suppressed (so charts skip it). */
export const cellValue = (c: Cell | undefined): number | undefined => (c && "n" in c ? c.n : undefined);

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function LoadState({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  if (loading) return <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  return <>{children}</>;
}

export function ModelNote() {
  return <Badge variant="outline">Suggested by model, needs review</Badge>;
}

export function Pager({ total, cursor, limit, onChange }: { total: number; cursor: number; limit: number; onChange: (cursor: number) => void }) {
  const from = total ? cursor + 1 : 0;
  const to = Math.min(total, cursor + limit);
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
      <span>{from}–{to} of {total}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={cursor === 0} onClick={() => onChange(Math.max(0, cursor - limit))}>Previous</Button>
        <Button size="sm" variant="outline" disabled={cursor + limit >= total} onClick={() => onChange(cursor + limit)}>Next</Button>
      </div>
    </div>
  );
}

export const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString() : "—");
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString() : "—");

export function RangeNote({ meta }: { meta: { range: { from: string; to: string }; denominator: { what: string; count: Cell } } }) {
  return (
    <p className="text-xs text-muted-foreground">
      {meta.range.from} to {meta.range.to}. Denominator: <CellText cell={meta.denominator.count} /> {meta.denominator.what}. Counts under 5 are suppressed.
    </p>
  );
}

export function DonorMix({ mix }: { mix: Record<"first_time" | "lapsed" | "recent", Cell> }) {
  return (
    <p className="text-xs text-muted-foreground">
      Donor mix: first-time <CellText cell={mix.first_time} />, lapsed <CellText cell={mix.lapsed} />, recent <CellText cell={mix.recent} />
    </p>
  );
}
