import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { consumeCallDraft } from "@/lib/callMemory";
import { redactTurnAsync } from "@/lib/localAi/asyncRedactor";
import { loadNer, runNer } from "@/lib/localAi/ner";
import { useSession } from "@/lib/session";
import { buildKnownIdentifiers, draftFromNote, redactionCounts } from "@sc/rules";
import { ApproveLogPayload, CueRulesFile, LogFields, LogRulesFile, PhraseRulesFile, type Donor, type DonorDoc, type LogFlag, type RawTurn } from "@sc/shared";
import cueRaw from "../../../../../data/cue-rules.json";
import logRaw from "../../../../../data/log-rules.json";
import phraseRaw from "../../../../../data/phrase-rules.json";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { CallRubric, useOrgRubric } from "@/components/dash/RubricPanel";
import { toast } from "sonner";

const cueRules = CueRulesFile.parse(cueRaw).rules;
const logRules = LogRulesFile.parse(logRaw);
const phraseRules = PhraseRulesFile.parse(phraseRaw).rules;
const labels: LogFlag[] = ["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"];

function forRedactor(d: DonorDoc): Donor {
  return { id: d._id, first_name: d.first_name, last_name: d.last_name, spouse_name: d.spouse_name ?? undefined, employer: d.employer ?? undefined, town: d.town ?? undefined, campaign: d.campaign, gift_band: d.gift_band, past_gift_count: d.past_gift_count, last_gift_band: d.last_gift_band, limits: d.limits };
}

export function PostCall() {
  const { donorId } = useParams();
  const rubricItems = useOrgRubric();
  const [search] = useSearchParams();
  const logId = search.get("log");
  const { me } = useSession();
  const [donor, setDonor] = useState<DonorDoc | null>(null);
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<LogFields | null>(null);
  const [sentPayload, setSentPayload] = useState<ApproveLogPayload | null>(null);
  const [approved, setApproved] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [localListening, setLocalListening] = useState<{ segments: number; backend: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => { if (donorId) void api<{ donor: DonorDoc }>(`/donors/${donorId}`).then((r) => setDonor(r.donor)).catch((err: unknown) => toast.error(errorMessage(err))); }, [donorId]);
  useEffect(() => {
    if (!logId) return;
    const local = consumeCallDraft(logId);
    if (!local || local.donorId !== donorId) return;
    setDraft(local.fields);
    setCounts(local.redactionCounts);
    setLocalListening({ segments: local.segmentCount, backend: local.nerBackend });
  }, [donorId, logId]);
  if (!logId || !donorId) return <p>Open a donor brief and start a call log first.</p>;

  const makeDraft = async () => {
    if (!donor || !note.trim() || !me) return;
    setDraftBusy(true);
    setLocalModelError(null);
    try {
      const ner = await loadNer();
      const raw: RawTurn = { id: crypto.randomUUID(), speaker: "volunteer", raw: note, t: 0 };
      const result = await redactTurnAsync(raw, {
        known: buildKnownIdentifiers(forRedactor(donor), me.user.display_name ?? me.user.name),
        phraseRules,
        ner: { enabled: true, run: runNer },
      });
      if (result.status === "held") {
        setLocalModelError("The local redaction model did not complete, so this note was held on the device.");
        return;
      }
      setCounts(redactionCounts([result.turn]));
      setDraft(draftFromNote(result.turn.scrubbed, { logRules, cueRules }));
      setLocalListening({ segments: 1, backend: `redaction ${ner.backend}` });
    } catch {
      setLocalModelError("Local redaction is unavailable. Run pnpm models:fetch, reload, and try again.");
    } finally {
      setDraftBusy(false);
    }
  };
  const edit = (patch: Partial<LogFields>) => setDraft((current) => current ? { ...current, ...patch } : null);
  const approve = async () => {
    if (!draft) return;
    const fields = LogFields.safeParse(draft);
    if (!fields.success) { toast.error("Check the structured fields before approval."); return; }
    const payload = ApproveLogPayload.parse({ idempotency_key: key.current, fields: fields.data, client_version: "p2-prototype" });
    // The sent ledger is the exact object passed to api().
    setSentPayload(payload);
    try {
      await api(`/logs/${logId}/approve`, { body: payload });
      setNote("");
      setApproved(true);
      toast.success("Log approved");
    } catch (err) { toast.error(errorMessage(err)); }
  };

  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Post-call log</h1>
    {localListening ? <Alert><AlertTitle>Local AI draft ready</AlertTitle><AlertDescription>{localListening.segments} scrubbed segment(s) produced this structured draft using {localListening.backend}. Raw audio and recognized text were discarded.</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>Short note on this device</CardTitle></CardHeader><CardContent className="space-y-3">
      <Textarea aria-label="Short call note" maxLength={600} value={note} onChange={(e) => { setNote(e.target.value); setDraft(null); setLocalListening(null); setSentPayload(null); }} disabled={approved} placeholder={localListening ? "The local listening draft is ready below. Type here to replace it." : "Write a short note, up to 600 characters"} />
      <p className="text-sm text-muted-foreground">{note.length}/600 characters</p>
      {localModelError ? <p className="text-sm text-destructive">{localModelError}</p> : null}
      {!approved ? <Button disabled={!donor || !note.trim() || draftBusy} onClick={() => void makeDraft()}>{draftBusy ? "Redacting locally…" : "Create local AI draft"}</Button> : <p>Note discarded after approval.</p>}
    </CardContent></Card>
    {draft ? <Card><CardHeader><CardTitle>Review and edit the structured draft</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
      <label className="block">Outcome <select className="ml-2 rounded border p-1" value={draft.outcome} disabled={approved} onChange={(e) => edit({ outcome: e.target.value as LogFields["outcome"] })}>{["reached", "voicemail", "no_answer", "declined", "rescheduled"].map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="block">Donor-stated reason <input className="ml-2 w-full rounded border p-2" maxLength={160} value={draft.donor_stated_reason} disabled={approved} onChange={(e) => edit({ donor_stated_reason: e.target.value })} /></label>
      <label className="block">Preference <select className="ml-2 rounded border p-1" value={draft.preference} disabled={approved} onChange={(e) => edit({ preference: e.target.value as LogFields["preference"] })}>{["none", "email_preferred", "stop_calls", "call_later"].map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="block"><input type="checkbox" checked={draft.follow_up.needed} disabled={approved} onChange={(e) => edit({ follow_up: { ...draft.follow_up, needed: e.target.checked } })} /> Follow-up needed</label>
      {draft.follow_up.needed ? <><label className="block">Action <input className="ml-2 w-full rounded border p-2" maxLength={120} value={draft.follow_up.action} disabled={approved} onChange={(e) => edit({ follow_up: { ...draft.follow_up, action: e.target.value } })} /></label>
        <label className="block">Due date <input type="date" className="ml-2 rounded border p-1" value={draft.follow_up.due_date ?? ""} disabled={approved} onChange={(e) => edit({ follow_up: { ...draft.follow_up, due_date: e.target.value || null } })} /></label></> : null}
      <div>Flags: {labels.map((label) => <label key={label} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={draft.flags.includes(label)} disabled={approved} onChange={(e) => edit({ flags: e.target.checked ? [...draft.flags, label] : draft.flags.filter((f) => f !== label) })} /> {label}</label>)}</div>
      {!approved ? <Button onClick={() => void approve()}>Approve structured log</Button> : <><Badge>Approved</Badge><Button asChild variant="outline"><Link to={`/logs/${logId}/warmth`}>Rate warmth</Link></Button><Button asChild variant="outline"><Link to={`/call/${donorId}/brief`}>Return to brief</Link></Button></>}
    </CardContent></Card> : null}
    {draft ? <CallRubric items={rubricItems} fields={draft} title="How this call scores" /> : null}
    <Alert><AlertTitle>Device and send ledger</AlertTitle><AlertDescription className="space-y-2">
      <p>Kept on this device: {approved ? "note discarded" : note || "no note yet"}</p>
      <p>Scrub counts: {JSON.stringify(counts)}</p>
      <p>Sent for approval: {sentPayload ? JSON.stringify(sentPayload) : "nothing yet"}</p>
    </AlertDescription></Alert>
  </div>;
}
