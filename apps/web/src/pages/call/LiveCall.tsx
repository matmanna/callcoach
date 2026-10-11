import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { keepCallDraft } from "@/lib/callMemory";
import { useSession } from "@/lib/session";
import { LocalAudioCapture } from "@/lib/localAi/audioCapture";
import { redactTurnAsync } from "@/lib/localAi/asyncRedactor";
import { loadNer, runNer } from "@/lib/localAi/ner";
import { loadSpeechModel, transcribeLocal } from "@/lib/localAi/speech";
import { buildKnownIdentifiers, draftFromNote, redactionCounts } from "@sc/rules";
import { CueRulesFile, LogRulesFile, PhraseRulesFile, type Donor, type DonorDoc, type RawTurn, type Turn } from "@sc/shared";
import cueRaw from "../../../../../data/cue-rules.json";
import logRaw from "../../../../../data/log-rules.json";
import phraseRaw from "../../../../../data/phrase-rules.json";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

const cueRules = CueRulesFile.parse(cueRaw).rules;
const logRules = LogRulesFile.parse(logRaw);
const phraseRules = PhraseRulesFile.parse(phraseRaw).rules;

function forRedactor(donor: DonorDoc): Donor {
  return {
    id: donor._id,
    first_name: donor.first_name,
    last_name: donor.last_name,
    spouse_name: donor.spouse_name ?? undefined,
    employer: donor.employer ?? undefined,
    town: donor.town ?? undefined,
    campaign: donor.campaign,
    gift_band: donor.gift_band,
    past_gift_count: donor.past_gift_count,
    last_gift_band: donor.last_gift_band,
    limits: donor.limits,
  };
}

type ModelState = "idle" | "loading" | "ready" | "failed";

export function LiveCall() {
  const { donorId } = useParams();
  const [search] = useSearchParams();
  const logId = search.get("log");
  const navigate = useNavigate();
  const { me } = useSession();
  const [donor, setDonor] = useState<DonorDoc | null>(null);
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [backend, setBackend] = useState("");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaker, setSpeaker] = useState<RawTurn["speaker"]>("donor");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [held, setHeld] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<LocalAudioCapture | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const speakerRef = useRef<RawTurn["speaker"]>("donor");
  const startedAt = useRef(0);

  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    if (!donorId) return;
    void api<{ donor: DonorDoc }>(`/donors/${donorId}`)
      .then((result) => setDonor(result.donor))
      .catch((err: unknown) => toast.error(errorMessage(err)));
    return () => { void capture.current?.stop(); };
  }, [donorId]);

  if (!donorId || !logId) return <p>Open a donor brief and start a call first.</p>;

  const prepare = async () => {
    setModelState("loading");
    setError(null);
    try {
      const [ner, speech] = await Promise.all([loadNer(), loadSpeechModel()]);
      setBackend(`speech ${speech.backend}; redaction ${ner.backend}`);
      setModelState("ready");
    } catch {
      setModelState("failed");
      setError("Local models are unavailable. Run pnpm models:fetch, then reload this page.");
    }
  };

  const startListening = async () => {
    if (!donor || !me || modelState !== "ready") return;
    setError(null);
    startedAt.current ||= Date.now();
    const known = buildKnownIdentifiers(forRedactor(donor), me.user.display_name ?? me.user.name);
    try {
      capture.current = await LocalAudioCapture.start(async (audio) => {
        setProcessing(true);
        try {
          const text = await transcribeLocal(audio);
          if (!text) return;
          const raw: RawTurn = { id: crypto.randomUUID(), speaker: speakerRef.current, raw: text, t: Date.now() - startedAt.current };
          const result = await redactTurnAsync(raw, { known, phraseRules, ner: { enabled: true, run: runNer } });
          if (result.status === "held") {
            setHeld((count) => count + 1);
            return;
          }
          turnsRef.current = [...turnsRef.current, result.turn];
          setTurns(turnsRef.current);
        } finally {
          setProcessing(false);
        }
      });
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed.");
    }
  };

  const stopListening = async () => {
    const active = capture.current;
    capture.current = null;
    setListening(false);
    if (active) await active.stop();
  };

  const finish = async () => {
    await stopListening();
    const localTurns = turnsRef.current;
    if (localTurns.length) {
      const scrubbed = localTurns.map((turn) => turn.scrubbed).join(" ").slice(0, 600);
      keepCallDraft({
        donorId,
        logId,
        fields: draftFromNote(scrubbed, { cueRules, logRules }),
        redactionCounts: redactionCounts(localTurns),
        segmentCount: localTurns.length,
        nerBackend: backend,
      });
    }
    navigate(`/call/${donorId}/post?log=${logId}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Call with {donor ? `${donor.first_name} ${donor.last_name}` : "donor"}</h1>
          <p className="text-sm text-muted-foreground">Local listening and redaction run on this device.</p>
        </div>
        <Button variant="outline" onClick={() => void finish()}>End call and review</Button>
      </div>

      <Alert>
        <AlertTitle>Device-only call processing</AlertTitle>
        <AlertDescription>Microphone audio and recognized raw text stay in memory on this device. Each segment is redacted locally, then its raw audio and text are discarded. Nothing is sent during the call.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Local listening AI</CardTitle>
          <CardDescription>Prepare the bundled Whisper and NER models before listening.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void prepare()} disabled={modelState === "loading" || listening}>
              {modelState === "loading" ? "Loading local models…" : modelState === "ready" ? "Local AI ready" : "Prepare local AI"}
            </Button>
            {modelState === "ready" ? <Badge variant="secondary">{backend}</Badge> : null}
            {listening ? <Badge>Listening</Badge> : null}
            {processing ? <Badge variant="outline">Processing locally</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Current speaker</span>
            <Select value={speaker} onValueChange={(value) => setSpeaker(value as RawTurn["speaker"])}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="donor">Donor</SelectItem><SelectItem value="volunteer">Volunteer</SelectItem></SelectContent>
            </Select>
            {!listening ? <Button onClick={() => void startListening()} disabled={modelState !== "ready" || !donor}>Start listening</Button> : <Button variant="destructive" onClick={() => void stopListening()}>Stop listening</Button>}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {held ? <p className="text-sm text-destructive">{held} segment(s) held because local NER did not complete.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Locally redacted transcript</CardTitle><CardDescription>Only scrubbed segments are retained for the post-call draft.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {turns.map((turn) => <div key={turn.id} className="rounded-lg border p-3 text-sm"><Badge variant="outline">{turn.speaker}</Badge><p className="mt-2">{turn.scrubbed}</p></div>)}
          {!turns.length ? <p className="text-sm text-muted-foreground">No processed segments yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
