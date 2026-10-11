import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { keepCallDraft } from "@/lib/callMemory";
import { useSession } from "@/lib/session";
import { LocalAudioCapture } from "@/lib/localAi/audioCapture";
import { redactTurnAsync } from "@/lib/localAi/asyncRedactor";
import { loadNer, runNer } from "@/lib/localAi/ner";
import { loadSpeechModel, transcribeLocal } from "@/lib/localAi/speech";
import { TwoVoiceDiarizer, loadStoredVoiceProfile, saveVoiceProfile, voiceProfileFromAudio, type SpeakerDetection } from "@/lib/localAi/speakerDetection";
import { buildKnownIdentifiers, draftFromNote, initialCueState, redactionCounts, selectCue, type Cue } from "@sc/rules";
import { CueRulesFile, LogRulesFile, PhraseRulesFile, type Donor, type DonorDoc, type Fact, type RawTurn, type Turn } from "@sc/shared";
import cueRaw from "../../../../../data/cue-rules.json";
import logRaw from "../../../../../data/log-rules.json";
import phraseRaw from "../../../../../data/phrase-rules.json";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { BookOpen, Pause, PhoneOff, Play, Settings2, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

const cueRules = CueRulesFile.parse(cueRaw).rules;
const logRules = LogRulesFile.parse(logRaw);
const phraseRules = PhraseRulesFile.parse(phraseRaw).rules;

interface LiveBrief {
  donor: { first_name: string; last_name: string; campaign: string; gift_band: string; past_gift_count: number; last_gift_band: string };
  limits: string[];
  fact_items: Array<Fact & { owner: string; stale: boolean }>;
  talking_points: string[];
}

interface LiveFlag { label: "DISTRESS" | "STOP_CONTACT" | "OFF_SCRIPT_CLAIM"; reason: string; id: string }

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
  const [brief, setBrief] = useState<LiveBrief | null>(null);
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [backend, setBackend] = useState("");
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaker, setSpeaker] = useState<RawTurn["speaker"]>("donor");
  const [autoDetectSpeaker, setAutoDetectSpeaker] = useState(true);
  const [speakerProfileReady, setSpeakerProfileReady] = useState(false);
  const [lastDetection, setLastDetection] = useState<SpeakerDetection | null>(null);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibrationState, setCalibrationState] = useState<"idle" | "recording" | "ready" | "failed">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [held, setHeld] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeCue, setActiveCue] = useState<Cue | null>(null);
  const [cueHistory, setCueHistory] = useState<Cue[]>([]);
  const [liveFlags, setLiveFlags] = useState<LiveFlag[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const capture = useRef<LocalAudioCapture | null>(null);
  const calibrationCapture = useRef<LocalAudioCapture | null>(null);
  const referenceSampleReceived = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const speakerRef = useRef<RawTurn["speaker"]>("donor");
  const autoDetectSpeakerRef = useRef(true);
  const diarizer = useRef<TwoVoiceDiarizer | null>(null);
  const startedAt = useRef(0);
  const cueState = useRef(initialCueState());
  const lastCueAt = useRef(-15_000);
  const autoStarted = useRef(false);

  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    autoDetectSpeakerRef.current = autoDetectSpeaker;
  }, [autoDetectSpeaker]);

  useEffect(() => {
    if (!donorId) return;
    void Promise.all([api<{ donor: DonorDoc }>(`/donors/${donorId}`), api<LiveBrief>(`/donors/${donorId}/brief`)])
      .then(([result, callBrief]) => { setDonor(result.donor); setBrief(callBrief); })
      .catch((err: unknown) => toast.error(errorMessage(err)));
    return () => { void capture.current?.stop(); void calibrationCapture.current?.stop(); };
  }, [donorId]);

  useEffect(() => {
    if (!me || diarizer.current) return;
    const stored = loadStoredVoiceProfile(me.user.id);
    if (!stored) return;
    diarizer.current = new TwoVoiceDiarizer(stored);
    setSpeakerProfileReady(true);
    setCalibrationState("ready");
  }, [me]);

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

  const suggestFlags = (turn: Turn, cue: Cue | null, stopContact: boolean) => {
    const next: LiveFlag[] = [];
    if (cue?.type === "distress") next.push({ label: "DISTRESS", reason: "Sensitive distress language needs coordinator review.", id: crypto.randomUUID() });
    if (stopContact) next.push({ label: "STOP_CONTACT", reason: "A stop-contact request needs coordinator review.", id: crypto.randomUUID() });
    if (turn.speaker === "volunteer") {
      const lower = turn.scrubbed.toLowerCase();
      if ((logRules.flag ?? []).some((rule) => rule.triggers.some((trigger) => lower.includes(trigger)))) next.push({ label: "OFF_SCRIPT_CLAIM", reason: "Possible off-script claim; review after the call.", id: crypto.randomUUID() });
    }
    if (!next.length) return;
    setLiveFlags((current) => [...current, ...next].slice(-3));
    for (const flag of next) window.setTimeout(() => setLiveFlags((current) => current.filter((item) => item.id !== flag.id)), 8_000);
  };

  const startListening = async () => {
    if (!donor || !me || modelState !== "ready") return;
    if (!diarizer.current) {
      setCalibrationOpen(true);
      return;
    }
    setError(null);
    startedAt.current ||= Date.now();
    const known = buildKnownIdentifiers(forRedactor(donor), me.user.display_name ?? me.user.name);
    try {
      // Three-second windows keep a turn from swallowing a speaker change. The second matching
      // non-volunteer window confirms the donor profile.
      capture.current = await LocalAudioCapture.start(async (audio) => {
        setProcessing(true);
        try {
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
          if (result.turn.speaker === "donor" && result.turn.t - lastCueAt.current >= 15_000) {
            const approvedFacts = brief?.fact_items ?? [];
            // A fact cue is usable only when that exact approved campaign fact is in this dossier.
            const usableRules = cueRules.filter((rule) => rule.type !== "fact" || approvedFacts.some((fact) => fact.id === rule.fact_id));
            const selected = selectCue(result.turn, usableRules, approvedFacts, cueState.current);
            cueState.current = selected.state;
            if (selected.cue) {
              lastCueAt.current = result.turn.t;
              setActiveCue(selected.cue);
              setCueHistory((current) => [...current, selected.cue!].slice(-4));
            }
            suggestFlags(result.turn, selected.cue, selected.dncCandidate);
          } else {
            suggestFlags(result.turn, null, false);
          }
          turnsRef.current = [...turnsRef.current, result.turn];
          setTurns(turnsRef.current);
        } finally {
          setProcessing(false);
        }
      }, 3);
      setListening(true);
      autoStarted.current = true;
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

  const recordReferenceSample = async () => {
    if (!me) return;
    referenceSampleReceived.current = false;
    setCalibrationState("recording");
    setError(null);
    try {
      calibrationCapture.current = await LocalAudioCapture.start(async (audio) => {
        if (referenceSampleReceived.current) return;
        referenceSampleReceived.current = true;
        const profile = voiceProfileFromAudio(audio);
        if (!profile) {
          setCalibrationState("failed");
          setError("No clear speech was detected. Try again in a quiet room and speak normally for the full 10 seconds.");
        } else {
          diarizer.current = new TwoVoiceDiarizer(profile);
          saveVoiceProfile(me.user.id, profile);
          setSpeakerProfileReady(true);
          setLastDetection(null);
          setCalibrationState("ready");
        }
        const active = calibrationCapture.current;
        calibrationCapture.current = null;
        void active?.stop();
      }, 10);
    } catch (err) {
      setCalibrationState("failed");
      setError(err instanceof Error ? err.message : "Microphone access failed while recording the reference sample.");
    }
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
    setCelebrating(true);
    window.setTimeout(() => navigate(`/call/${donorId}/post?log=${logId}`), 650);
  };

  useEffect(() => { void prepare(); }, []);
  useEffect(() => {
    if (modelState !== "ready" || !donor || !me || listening || autoStarted.current) return;
    if (!diarizer.current) { setCalibrationOpen(true); return; }
    void startListening();
  }, [modelState, donor, me, listening]);

  return (
    <div className="min-h-screen bg-[#f4f0e6] px-4 py-5 text-[#26352c] sm:px-7">
      <header className="mx-auto flex max-w-7xl items-center justify-between">
        <div><p className="text-xs font-medium tracking-[0.2em] text-[#6f796d]">LIVE CALL</p><h1 className="mt-1 text-lg font-semibold">{brief ? `${brief.donor.first_name} ${brief.donor.last_name}` : "Preparing donor brief"}</h1></div>
        {listening ? <div className="flex items-center gap-2 text-xs text-[#526257]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#6d8c6c]" />Listening locally</div> : null}
      </header>

      <div className="mx-auto mt-6 grid max-w-7xl gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(320px,1.2fr)_minmax(250px,0.8fr)]">
        <aside className="rounded-2xl border border-[#d5c9af] bg-[#eee6d5] p-5 text-[#384238] shadow-sm">
          <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">CALL DOSSIER</p>
          <h2 className="mt-3 text-xl font-semibold">{brief?.donor.first_name} {brief?.donor.last_name}</h2>
          <p className="mt-1 text-sm text-stone-600">{brief?.donor.campaign}</p>
          <div className="mt-5 space-y-3 text-sm"><p className="flex items-center gap-2"><Target size={15} className="text-stone-500" /><strong>{brief?.donor.gift_band}</strong> gift band</p><p className="flex items-center gap-2"><BookOpen size={15} className="text-stone-500" />{brief?.donor.past_gift_count ?? 0} past gifts · last {brief?.donor.last_gift_band ?? "—"}</p></div>
          <div className="mt-5 rounded-xl bg-amber-100/90 p-3 text-sm"><p className="flex items-center gap-2 font-semibold"><Sparkles size={15} />Limits</p><p className="mt-1 text-stone-700">{brief?.limits.length ? brief.limits.join(" · ") : "No stated limits"}</p></div>
          {brief?.talking_points.length ? <div className="mt-5 border-t border-stone-400/30 pt-4"><p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-500"><BookOpen size={14} />APPROVED TALKING POINTS</p>{brief.talking_points.slice(0, 3).map((point, index) => <p key={index} className="mt-2 text-sm leading-relaxed">{point}</p>)}</div> : null}
        </aside>

        <section className="min-h-[500px] rounded-2xl border border-[#d8d4c8] bg-[#fbf8f1] p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-sm text-[#687369]">Private local transcript</p>{processing ? <Badge variant="outline" className="border-[#b9c9b6] text-[#526257]">processing</Badge> : null}</div>
          <div className="mt-12 text-center"><div className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-[#c8d6c4] bg-[#e4eee1] ${listening ? "animate-pulse" : ""}`}><span className="h-16 w-16 rounded-full bg-[#b8cfb6]" /></div><p className="mt-5 text-sm text-[#657066]">{listening ? "Listening and redacting on this device." : "Local audio will begin with the call."}</p></div>
          <div className="mt-10 space-y-3">{turns.slice(-3).map((turn) => <div key={turn.id} className="rounded-xl border border-[#e2ddd0] bg-[#f4f0e7] p-3 text-sm"><span className="text-xs font-medium uppercase tracking-wide text-[#778175]">{turn.speaker}</span><p className="mt-1 leading-relaxed text-[#384238]">{turn.scrubbed}</p></div>)}{!turns.length ? <p className="text-center text-sm text-[#879084]">Scrubbed local turns will appear here.</p> : null}</div>
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}{held ? <p className="mt-4 text-sm text-[#8a6a33]">{held} segment(s) held while local redaction completes.</p> : null}
        </section>

        {activeCue ? <aside className="rounded-2xl border border-[#c8d6c4] bg-[#e4eee1] p-5 text-[#334238] shadow-sm"><p className="text-xs font-semibold tracking-[0.18em] text-[#6e7d70]">CURRENT CUE</p><p className="mt-5 text-lg font-medium leading-relaxed">{activeCue.card_text}</p>{activeCue.source ? <p className="mt-4 text-xs text-[#5d6d61]">Source: {activeCue.source} · verified {activeCue.verified_on}</p> : null}<div className="mt-8 flex gap-2">{cueHistory.map((cue, index) => <button key={`${cue.rule_id}-${index}`} onClick={() => setActiveCue(cue)} aria-label={`Show cue ${index + 1}`} className={`h-2.5 w-2.5 rounded-full ${activeCue.rule_id === cue.rule_id ? "bg-[#49644d]" : "bg-[#aabca6]"}`} />)}</div><p className="mt-4 text-xs text-[#5d6d61]">One cue per donor turn, with at least 15 seconds between cues.</p></aside> : <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[#c9c4b7] p-6 text-center text-sm text-[#7b8378]"><div><Sparkles className="mx-auto mb-3 text-[#9aa696]" size={22} /><p>No cue right now.</p><p className="mt-1 text-xs">A single approved cue appears only when the donor&apos;s words match a rule.</p></div></div>}
      </div>

      <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center"><div className="flex items-center gap-2 rounded-2xl border border-[#d2c8b6] bg-[#f8f4eb] px-3 py-3 shadow-lg"><Button size="icon-sm" variant="outline" className="border-[#d5cabb] bg-[#fffdf8] text-[#4d5e50]" onClick={() => setControlsOpen(true)} aria-label="Call controls" title="Call controls"><Settings2 size={17} /></Button>{listening ? <Button size="icon-sm" variant="outline" className="border-[#d5cabb] bg-[#fffdf8] text-[#4d5e50]" onClick={() => void stopListening()} aria-label="Pause listening" title="Pause listening"><Pause size={17} /></Button> : <Button size="icon-sm" variant="outline" className="border-[#d5cabb] bg-[#fffdf8] text-[#4d5e50]" onClick={() => void startListening()} disabled={modelState !== "ready"} aria-label="Resume listening" title="Resume listening"><Play size={17} /></Button>}<Button size="icon-sm" variant="destructive" onClick={() => void finish()} disabled={celebrating} aria-label="Hang up and review" title="Hang up and review"><PhoneOff size={17} /></Button></div></div>
      <div className="fixed bottom-24 right-5 z-40 flex w-72 flex-col gap-2">{liveFlags.map((flag) => <div key={flag.id} className="animate-in slide-in-from-bottom-5 fade-in rounded-xl border border-[#d4c8ad] bg-[#f7f1e4] p-3 text-sm text-[#4b4638] shadow-lg"><p className="font-semibold">Review suggested: {flag.label}</p><p className="mt-1 text-[#716852]">{flag.reason}</p></div>)}</div>
      {celebrating ? <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">{Array.from({ length: 24 }, (_, index) => <span key={index} className="absolute top-1/3 h-2 w-2 animate-ping rounded-full bg-[#a9c4a5]" style={{ left: `${(index * 17) % 100}%`, animationDelay: `${index * 35}ms` }} />)}</div> : null}

      <Dialog open={calibrationOpen} onOpenChange={(open) => { if (calibrationState !== "recording") setCalibrationOpen(open); }}>
        <DialogContent showCloseButton={calibrationState !== "recording"}>
          <DialogHeader>
            <DialogTitle>Set up two-voice detection</DialogTitle>
            <DialogDescription>Record a short local reference before the call. The app uses it only to tell your voice apart from the other person&apos;s voice.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Use the same microphone and distance you will use for the call.</li>
            <li>Choose a quiet space and keep the donor&apos;s voice silent during the sample.</li>
            <li>Press record and speak naturally for <strong>10 seconds</strong>: two or three full sentences at normal volume.</li>
            <li>During the call, let each person speak for at least two segments before trusting the automatic donor label.</li>
          </ol>
          {calibrationState === "failed" ? <p className="text-sm text-destructive">Reference sample was not saved. Try again.</p> : null}
          {calibrationState === "ready" ? <p className="text-sm text-muted-foreground">Reference sample ready. In Tauri, its compact acoustic profile is saved only on this device for future calls.</p> : null}
          <DialogFooter>
            {calibrationState === "ready" ? <Button onClick={() => { setCalibrationOpen(false); void startListening(); }}>Start call</Button> : <Button onClick={() => void recordReferenceSample()} disabled={calibrationState === "recording"}>{calibrationState === "recording" ? "Recording 10-second sample…" : "Record 10-second sample"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={controlsOpen} onOpenChange={setControlsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Call controls</DialogTitle><DialogDescription>These controls affect only this local call session.</DialogDescription></DialogHeader>
          <div className="space-y-4"><label className="block text-sm font-medium">Fallback speaker</label><Select value={speaker} onValueChange={(value) => setSpeaker(value as RawTurn["speaker"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="donor">Donor</SelectItem><SelectItem value="volunteer">Volunteer</SelectItem></SelectContent></Select><div className="flex items-center justify-between gap-3"><span className="text-sm">Automatic two-voice labels</span><Button size="sm" variant={autoDetectSpeaker ? "secondary" : "outline"} onClick={() => setAutoDetectSpeaker((enabled) => !enabled)} disabled={!speakerProfileReady}>{autoDetectSpeaker ? "On" : "Off"}</Button></div><Button variant="outline" onClick={() => { setControlsOpen(false); setCalibrationOpen(true); }} disabled={listening}>Recalibrate voice</Button><p className="text-xs text-muted-foreground">{lastDetection?.voiced ? `Latest local label: ${lastDetection.speaker}${lastDetection.learnedOtherVoice ? "; two voices confirmed." : "; checking second voice."}` : "No voiced segment detected yet."}</p></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
