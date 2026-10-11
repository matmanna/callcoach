import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface Hit { sheet_id: string; item_id: string; text: string; source: string; verified_on: string; highlights: string[] }

/** Splits text on the highlight terms so matches can be emphasised without HTML. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const words = [...new Set(terms.filter(Boolean))].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) => (words.some((w) => new RegExp(`^${w}$`, "i").test(p)) ? <mark key={i} className="rounded bg-[#fbf1d4] px-0.5 text-inherit">{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

/** Approved facts only. Keyword search; Atlas Search adds fuzzy matching when the server runs on Atlas. */
export function FactSearch({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const handle = window.setTimeout(() => {
      api<{ results: Hit[] }>(`/fact-sheets/search?q=${encodeURIComponent(q)}`)
        .then((r) => (setHits(r.results), setError(null)))
        .catch((err: unknown) => setError(errorMessage(err)));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <Search className="size-4" />
            Search facts
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Search approved facts</DialogTitle>
          <DialogDescription>Only approved facts are searched, the same ones callers see. Drafts never appear here.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Try: mentoring, camp, budget" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search approved facts" />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {hits === null ? <p className="text-sm text-muted-foreground">Type to search.</p> : null}
        {hits?.length === 0 ? <p className="text-sm text-muted-foreground">No approved fact matches “{q}”.</p> : null}
        <ul className="max-h-[50vh] space-y-3 overflow-y-auto">
          {hits?.map((h) => (
            <li key={`${h.sheet_id}-${h.item_id}`} className="rounded-xl border p-3 text-sm">
              <p><Highlighted text={h.text} terms={h.highlights.length ? h.highlights : [q]} /></p>
              <p className="mt-1 text-xs text-muted-foreground">Source: {h.source} · verified {h.verified_on}</p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
