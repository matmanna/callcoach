import { LoadState, PageHeader, Pager, fmtDate } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { Link } from "react-router";

interface Contact {
  id: string;
  external_id: string;
  first_name: string;
  last_name: string;
  campaign: string;
  gift_band: string;
  region: string | null;
  team_names: string[];
  last_contact: string | null;
  open_follow_ups: number;
  limits_present: boolean;
}
interface Res {
  total: number;
  contacts: Contact[];
  next_cursor: string | null;
}

const ANY = "any";
const LIMIT = 25;

export function ContactsPage() {
  const scope = useTeamScope();
  const [cursor, setCursor] = useState(0);
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const [campaign, setCampaign] = useState("");
  const [band, setBand] = useState("");
  const [lastBefore, setLastBefore] = useState("");
  const [fu, setFu] = useState(ANY);
  const [limits, setLimits] = useState(ANY);
  const path = withQuery(
    "/contacts",
    scope.q,
    `limit=${LIMIT}`,
    `cursor=${cursor}`,
    `sort=${sort}`,
    `dir=${dir}`,
    campaign && `campaign=${encodeURIComponent(campaign)}`,
    band && `gift_band=${encodeURIComponent(band)}`,
    lastBefore && `last_contact_before=${lastBefore}`,
    fu !== ANY && `has_open_follow_ups=${fu}`,
    limits !== ANY && `has_limits=${limits}`,
  );
  const { data, error, loading } = useApi<Res>(path);
  const reset = <T,>(set: (v: T) => void) => (v: T) => (setCursor(0), set(v));
  return (
    <>
      <PageHeader title="Contacts" description="Donors on the teams in scope. Open a contact for its dossier." />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Input className="w-48" placeholder="Campaign" value={campaign} onChange={(e) => reset(setCampaign)(e.target.value)} aria-label="Campaign filter" />
        <Input className="w-36" placeholder="Gift band" value={band} onChange={(e) => reset(setBand)(e.target.value)} aria-label="Gift band filter" />
        <label className="text-xs text-muted-foreground">
          Last contact before
          <Input type="date" className="w-40" value={lastBefore} onChange={(e) => reset(setLastBefore)(e.target.value)} />
        </label>
        <Select value={fu} onValueChange={reset(setFu)}>
          <SelectTrigger className="w-44" aria-label="Open follow-ups"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Follow-ups: any</SelectItem>
            <SelectItem value="true">Has open follow-ups</SelectItem>
            <SelectItem value="false">No open follow-ups</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limits} onValueChange={reset(setLimits)}>
          <SelectTrigger className="w-44" aria-label="Stated limits"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Limits: any</SelectItem>
            <SelectItem value="true">Has stated limits</SelectItem>
            <SelectItem value="false">No stated limits</SelectItem>
          </SelectContent>
        </Select>
        <Select value={`${sort}:${dir}`} onValueChange={(v) => { const [s, d] = v.split(":"); setCursor(0); setSort(s!); setDir(d!); }}>
          <SelectTrigger className="w-48" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name:asc">Name (A to Z)</SelectItem>
            <SelectItem value="name:desc">Name (Z to A)</SelectItem>
            <SelectItem value="campaign:asc">Campaign</SelectItem>
            <SelectItem value="gift_band:asc">Gift band</SelectItem>
            <SelectItem value="last_contact:desc">Last contact (newest)</SelectItem>
            <SelectItem value="last_contact:asc">Last contact (oldest)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <LoadState loading={loading} error={error}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Gift band</TableHead>
              <TableHead>Last contact</TableHead>
              <TableHead>Open follow-ups</TableHead>
              <TableHead>Limits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell><Link className="underline" to={scope.link(`/coordinator/contacts/${c.id}`)}>{c.first_name} {c.last_name}</Link></TableCell>
                <TableCell className="text-muted-foreground">{c.external_id}</TableCell>
                <TableCell>{c.team_names.join(", ")}</TableCell>
                <TableCell>{c.campaign}</TableCell>
                <TableCell>{c.gift_band}</TableCell>
                <TableCell>{fmtDate(c.last_contact)}</TableCell>
                <TableCell>{c.open_follow_ups}</TableCell>
                <TableCell>{c.limits_present ? <Badge variant="secondary">stated</Badge> : "—"}</TableCell>
              </TableRow>
            ))}
            {data && !data.contacts.length ? <TableRow><TableCell colSpan={8} className="text-muted-foreground">No contacts match.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        {data ? <Pager total={data.total} cursor={cursor} limit={LIMIT} onChange={setCursor} /> : null}
      </LoadState>
    </>
  );
}
