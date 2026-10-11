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
import { TwoVoiceDiarizer, voiceProfileFromAudio, type SpeakerDetection } from "@/lib/localAi/speakerDetection";
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
  const [autoDetectSpeaker, setAutoDetectSpeaker] = useState(true);
  const [calibratingSpeaker, setCalibratingSpeaker] = useState(false);
  const [speakerProfileReady, setSpeakerProfileReady] = useState(false);
  const [lastDetection, setLastDetection] = useState<SpeakerDetection | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [held, setHeld] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<LocalAudioCapture | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const speakerRef = useRef<RawTurn["speaker"]>("donor");
  const autoDetectSpeakerRef = useRef(true);
  const calibratingSpeakerRef = useRef(false);
  const diarizer = useRef<TwoVoiceDiarizer | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    autoDetectSpeakerRef.current = autoDetectSpeaker;
  }, [autoDetectSpeaker]);

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
      // Transformers.js configures a shared ONNX Runtime singleton. Load in order so NER and
      // Whisper never race while configuring its local WASM worker paths.
      const ner = await loadNer();
      const speech = await loadSpeechModel();
      setBackend(`speech ${speech.backend}; redaction ${ner.backend}`);
      setModelState("ready");
    } catch (err) {
      setModelState("failed");
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(`Local models could not start. Reload the desktop app and try again. If this continues, run pnpm models:fetch from the repository root.${detail}`);
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
          if (calibratingSpeakerRef.current) {
            const profile = voiceProfileFromAudio(audio);
            if (profile) {
              diarizer.current = new TwoVoiceDiarizer(profile);
              calibratingSpeakerRef.current = false;
              setCalibratingSpeaker(false);
              setSpeakerProfileReady(true);
              setLastDetection(null);
            }
          }
          const detection = diarizer.current && autoDetectSpeakerRef.current
            ? diarizer.current.detect(audio)
            : null;
          if (detection) setLastDetection(detection);
          const text = await transcribeLocal(audio);
          if (!text) return;
          const detectedSpeaker = detection?.speaker === "unknown" ? null : detection?.speaker;
          const raw: RawTurn = { id: crypto.randomUUID(), speaker: detectedSpeaker ?? speakerRef.current, raw: text, t: Date.now() - startedAt.current };
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

  const calibrateVolunteerVoice = () => {
    calibratingSpeakerRef.current = true;
    setCalibratingSpeaker(true);
    setLastDetection(null);
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
    diarizer.current = null;
    calibratingSpeakerRef.current = false;
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
          <CardDescription>Prepare the bundled Whisper and NER models before listening. Local diarization separates two voices after you calibrate yours.</CardDescription>
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
          <div className="rounded-lg border p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <strong>Local speaker detection</strong>
              {speakerProfileReady ? <Badge variant="secondary">Two-voice detection ready</Badge> : <Badge variant="outline">Manual labels</Badge>}
              <Button size="sm" variant="outline" onClick={calibrateVolunteerVoice} disabled={!listening || calibratingSpeaker}>
                {calibratingSpeaker ? "Listening for your voice…" : "Calibrate my voice"}
              </Button>
              <Button size="sm" variant={autoDetectSpeaker ? "secondary" : "outline"} onClick={() => setAutoDetectSpeaker((enabled) => !enabled)} disabled={!speakerProfileReady}>
                Auto detection: {autoDetectSpeaker ? "on" : "off"}
              </Button>
            </div>
            <p className="text-muted-foreground">With the call on speaker, press Calibrate my voice and speak for one segment. Two matching segments from a clearly different voice establish the other speaker. Labels are suggestions from this microphone only; use Current speaker to override them. No voice profile, audio, or raw text leaves this device.</p>
            {lastDetection?.voiced ? <p className="text-muted-foreground">Latest local label: likely {lastDetection.speaker} ({Math.round(lastDetection.confidence * 100)}% match confidence){lastDetection.learnedOtherVoice ? "; two voices learned" : ""}.</p> : null}
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
