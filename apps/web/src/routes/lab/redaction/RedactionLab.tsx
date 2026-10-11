/**
 * LAB ONLY (Prompts D and D2). PROTOTYPE, not final UI. Raw text is rendered in this tab and
 * never sent: requests carry scrubbed transcripts (M, A) or the template note (N) only.
 */
import { explainRedaction, type LayerSelection } from "@sc/rules/lab";
import { buildKnownIdentifiers, type ExtraInterval, type IdentifierCounts } from "@sc/rules";
import type { RawTurn, Turn } from "@sc/shared";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { guardRemote, sendToLab } from "../../../lab/redaction/api.ts";
import { excerpts, nerAllowlist, type LabExcerpt } from "../../../lab/redaction/data.ts";
import { installNetworkCounter, networkCounts, onNetworkChange, resetNetworkCounts } from "../../../lab/redaction/network.ts";
import {
  COMBOS,
  LAYERS_A,
  LAYER_KEYS,
  VARIANTS,
  buildOutbound,
  compareFlags,
  ctxFor,
  guardBlocks,
  layerCoverage,
  ledgerFor,
  localGuard,
  matrixCsv,
  noteFromTurns,
  percentile,
  runPool,
  scrubExcerpt,
  summarize,
  survivingPlanted,
  type CoverageRow,
  type LayerKey,
  type MatrixRow,
  type NerByTurn,
  type SendResult,
  type TurnLayerIntervals,
  type Variant,
} from "../../../lab/redaction/pipeline.ts";
import { redactTurnAsync } from "../../../lib/localAi/asyncRedactor.ts";
import { summarizeLocally, type LocalSummaryResult } from "../../../lib/localAi/localSummary.ts";
import { DEFAULT_NER_THRESHOLD, type NerInterval } from "../../../lib/localAi/nerTypes.ts";
import "./lab.css";

// Install before any model code loads so every request from this page is counted.
installNetworkCounter();

type NerModule = typeof import("../../../lib/localAi/ner.ts");
let nerModule: Promise<NerModule> | null = null;
const getNer = () => (nerModule ??= import("../../../lib/localAi/ner.ts"));

interface NerExcerptResult {
  byTurn: Map<string, NerInterval[]>;
  latencies: number[];
  heldTurnIds: string[];
  skipped: boolean;
}

type NerModelState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; ms: number; backend: string }
  | { state: "failed"; error: string };

const LAYER_LABEL: Record<LayerKey, string> = { known: "known identifiers (1)", regex: "regex (2)", phrase: "phrase rules (3)", ner: "local NER (layer 4)" };

function useNetwork() {
  return useSyncExternalStore(onNetworkChange, () => JSON.stringify(networkCounts()));
}

function Banner({ children, raw }: { children: string; raw?: boolean }) {
  return <div className={raw ? "lab-banner raw" : "lab-banner"}>{children}</div>;
}

function NetworkStrip() {
  const counts = JSON.parse(useNetwork()) as ReturnType<typeof networkCounts>;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return (
    <div className="lab-strip" data-testid="network-strip">
      <span>navigator.onLine: {String(online)}</span>
      <span>
        outbound requests since load: <b data-testid="outbound-count">{counts.outbound}</b>
        {counts.outboundOrigins.length ? ` (${counts.outboundOrigins.join(", ")})` : ""}
      </span>
      <span>same-origin (local files): {counts.sameOrigin}</span>
      <button onClick={resetNetworkCounts}>reset counter</button>
    </div>
  );
}

/** Raw text with per-layer highlights. Rendered only in this tab. */
function Highlighted({ text, spans }: { text: string; spans: Array<{ start: number; end: number; cls: string; title: string }> }) {
  const cuts = new Set<number>([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const covering = spans.filter((s) => s.start <= a && s.end >= b);
    const seg = text.slice(a, b);
    parts.push(
      covering.length ? (
        <span key={a} className={covering.map((c) => c.cls).join(" ")} title={covering.map((c) => c.title).join("\n")}>
          {seg}
        </span>
      ) : (
        <span key={a}>{seg}</span>
      ),
    );
  }
  return <span>{parts}</span>;
}

function turnSpans(raw: RawTurn, x: LabExcerpt, layers: LayerSelection, nerOn: boolean, ner: NerInterval[] | undefined) {
  const ctx = ctxFor(x);
  const extra: ExtraInterval[] = nerOn ? (ner ?? []) : [];
  const e = explainRedaction(raw, ctx, layers, extra);
  const spans: Array<{ start: number; end: number; cls: string; title: string }> = [];
  for (const key of ["known", "regex", "phrase"] as const) for (const iv of e.layers[key]) spans.push({ start: iv.start, end: iv.end, cls: `hl-${key}`, title: `${key}: ${iv.type}` });
  if (nerOn) for (const iv of ner ?? []) spans.push({ start: iv.start, end: iv.end, cls: "hl-ner", title: `NER ${iv.label} -> ${iv.type}, score ${iv.score.toFixed(3)}` });
  const scrubLower = e.scrubbed.toLowerCase();
  const rawLower = raw.raw.toLowerCase();
  for (const p of x.planted) {
    const v = p.value.toLowerCase();
    if (!scrubLower.includes(v)) continue;
    for (let i = rawLower.indexOf(v); i >= 0; i = rawLower.indexOf(v, i + 1)) spans.push({ start: i, end: i + v.length, cls: "hl-survivor", title: `SURVIVES: planted ${p.type}` });
  }
  return { spans, scrubbed: e.scrubbed };
}

function intervalsForCoverage(x: LabExcerpt, ner: NerExcerptResult | undefined): Map<string, TurnLayerIntervals> {
  const ctx = ctxFor(x);
  const out = new Map<string, TurnLayerIntervals>();
  for (const t of x.turns) {
    const e = explainRedaction(t, ctx, LAYERS_A);
    out.set(t.id, { known: e.layers.known, regex: e.layers.regex, phrase: e.layers.phrase, ner: ner?.byTurn.get(t.id) ?? [] });
  }
  return out;
}

function FlagCompare({ expected, result }: { expected: LabExcerpt["expected_flags"]; result: SendResult | null }) {
  if (!result) return null;
  const c = compareFlags(expected, result.flags.map((f) => f.label));
  return (
    <div>
      <div>
        expected: {expected.length ? expected.join(", ") : "(none)"}
      </div>
      <div>
        {c.correct.map((l) => (
          <span key={`c${l}`} className="badge ok">match {l}</span>
        ))}{" "}
        {c.missing.map((l) => (
          <span key={`m${l}`} className="badge bad">missing {l}</span>
        ))}{" "}
        {c.extra.map((l) => (
          <span key={`e${l}`} className="badge warn">extra {l}</span>
        ))}
        {!c.correct.length && !c.missing.length && !c.extra.length ? <span className="badge ok">match (no flags)</span> : null}
      </div>
    </div>
  );
}

function ResultView({ result, expected }: { result: SendResult | null; expected: LabExcerpt["expected_flags"] }) {
  if (!result) return <p className="muted">Nothing sent yet.</p>;
  return (
    <div>
      <div>
        status: <b>{result.status}</b> {result.mock ? <span className="badge mock">MOCK</span> : null}
        {result.error ? ` (${result.error})` : ""}
      </div>
      <ul>
        {result.flags.map((f, i) => (
          <li key={i}>
            <b>{f.label}</b>: {f.reason}
          </li>
        ))}
        {!result.flags.length ? <li className="muted">no flags</li> : null}
      </ul>
      {result.dropped_labels.length ? <div>dropped labels: {result.dropped_labels.join(", ")}</div> : null}
      <div>
        latency {result.latency_ms} ms (response {result.response_latency_ms ?? "n/a"} ms), tokens in {result.input_tokens} / out {result.output_tokens}, payload {result.payload_chars} chars
      </div>
      <FlagCompare expected={expected} result={result} />
    </div>
  );
}

function GuardCounts({ c }: { c: IdentifierCounts }) {
  return (
    <span>
      phone {c.phone}, email {c.email}, address {c.address}, dob {c.dob} {guardBlocks(c) ? <span className="badge bad">would block</span> : <span className="badge ok">passes</span>}
    </span>
  );
}

function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>type</th>
          <th>planted</th>
          {LAYER_KEYS.map((k) => (
            <th key={k}>caught by {k}</th>
          ))}
          {COMBOS.map((c) => (
            <th key={c.label}>survive {c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type}>
            <td>{r.type}</td>
            <td>{r.planted}</td>
            {LAYER_KEYS.map((k) => (
              <td key={k}>{r.caughtBy[k]}</td>
            ))}
            {COMBOS.map((c) => (
              <td key={c.label}>{r.survivors[c.label]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function RedactionLab() {
  const [excerptId, setExcerptId] = useState(excerpts[0]!.id);
  const x = excerpts.find((e) => e.id === excerptId)!;
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ known: true, regex: true, phrase: true, ner: false });
  const [variant, setVariant] = useState<Variant>("N");
  const [result, setResult] = useState<SendResult | null>(null);
  const [remoteGuard, setRemoteGuard] = useState<{ guard_counts: IdentifierCounts; comprehend: Record<string, number> | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nerSetting, setNerSetting] = useState<"on" | "off">("on");
  const [model, setModel] = useState<NerModelState>({ state: "idle" });
  const [nerInfo, setNerInfo] = useState<{ id: string; bytes: number } | null>(null);
  const [nerResults, setNerResults] = useState<Map<string, NerExcerptResult>>(new Map());
  const [continueWithoutNer, setContinueWithoutNer] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(DEFAULT_NER_THRESHOLD);

  const [matrix, setMatrix] = useState<MatrixRow[] | null>(null);
  const [runningAll, setRunningAll] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null);
  const [summaries, setSummaries] = useState<Map<string, LocalSummaryResult>>(new Map());
  const [ollamaModel, setOllamaModel] = useState("llama3.2:3b");

  const nerOn = layers.ner && nerSetting === "on" && model.state === "ready";
  const nerForExcerpt = nerResults.get(x.id);
  const nerByTurn: NerByTurn | undefined = nerOn ? nerForExcerpt?.byTurn : undefined;
  const heldTurnIds = nerSetting === "on" && layers.ner ? (nerForExcerpt?.heldTurnIds ?? []) : [];
  const held = heldTurnIds.length > 0 && !continueWithoutNer.has(x.id);
  const selectedLayers: LayerSelection = { known: layers.known, regex: layers.regex, phrase: layers.phrase };

  useEffect(() => {
    setResult(null);
    setRemoteGuard(null);
  }, [excerptId, variant]);

  async function loadModel() {
    setModel({ state: "loading" });
    try {
      const ner = await getNer();
      const s = await ner.loadNer();
      setNerInfo({ id: ner.NER_MODEL_ID, bytes: ner.NER_MODEL_BYTES });
      setModel({ state: "ready", ms: s.ms, backend: s.backend });
    } catch (err) {
      setModel({ state: "failed", error: err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "unknown" });
    }
  }

  async function runNerFor(target: LabExcerpt, allowSkip: boolean): Promise<NerExcerptResult> {
    const ner = await getNer();
    const ctx = { ...ctxFor(target), ner: { enabled: true, run: ner.runNer, options: { threshold, allowlist: nerAllowlist } }, continueWithoutNer: allowSkip };
    const res: NerExcerptResult = { byTurn: new Map(), latencies: [], heldTurnIds: [], skipped: false };
    for (const t of target.turns) {
      const r = await redactTurnAsync(t, ctx);
      res.latencies.push(r.timings.ner_ms);
      if (r.status === "held") res.heldTurnIds.push(t.id);
      else {
        res.byTurn.set(t.id, r.nerIntervals);
        if (r.nerSkipped) res.skipped = true;
      }
    }
    return res;
  }

  async function runNerCurrent() {
    setBusy(true);
    try {
      const r = await runNerFor(x, continueWithoutNer.has(x.id));
      setNerResults((m) => new Map(m).set(x.id, r));
    } finally {
      setBusy(false);
    }
  }

  // Run NER for the selected excerpt when the layer is switched on.
  useEffect(() => {
    if (layers.ner && nerSetting === "on" && model.state === "ready" && !nerResults.has(x.id)) void runNerCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.ner, nerSetting, model.state, x.id, threshold]);

  useEffect(() => {
    setNerResults(new Map());
  }, [threshold]);

  const outbound = useMemo(() => buildOutbound(x, variant, nerByTurn), [x, variant, nerByTurn]);
  const ledger = ledgerFor(x, outbound);
  const guard = localGuard(outbound.modelText);
  const survivors = survivingPlanted(x, outbound.modelText);

  async function send() {
    if (held) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await sendToLab(outbound.body, `single-${Date.now()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "send failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkRemoteGuard() {
    try {
      setRemoteGuard(await guardRemote(outbound.modelText));
    } catch (err) {
      setError(err instanceof Error ? err.message : "guard failed");
    }
  }

  async function runAll() {
    setError(null);
    const runId = `run-${Date.now()}`;
    let nerAll = nerResults;
    if (nerSetting === "on" && model.state === "ready") {
      setRunningAll("running NER over all excerpts");
      nerAll = new Map(nerResults);
      for (const e of excerpts) if (!nerAll.has(e.id)) nerAll.set(e.id, await runNerFor(e, continueWithoutNer.has(e.id)));
      setNerResults(nerAll);
    }
    const nerReady = nerSetting === "on" && model.state === "ready";
    const tasks = excerpts.flatMap((e) => VARIANTS.map((v) => ({ e, v })));
    let done = 0;
    setRunningAll(`0 / ${tasks.length}`);
    const rows = await runPool(tasks, 2, async ({ e, v }): Promise<MatrixRow> => {
      const off = buildOutbound(e, v);
      const nerRes = nerAll.get(e.id);
      const on = nerReady && nerRes && !nerRes.heldTurnIds.length ? buildOutbound(e, v, nerRes.byTurn) : null;
      const g = localGuard(off.modelText);
      let res: SendResult | null = null;
      try {
        res = await sendToLab(off.body, runId);
      } catch (err) {
        res = null;
        setError(err instanceof Error ? err.message : "send failed");
      }
      done += 1;
      setRunningAll(`${done} / ${tasks.length}`);
      return {
        excerptId: e.id,
        variant: v,
        plantedTotal: e.planted.length,
        survivorsNerOff: survivingPlanted(e, off.modelText).length,
        survivorsNerOn: on ? survivingPlanted(e, on.modelText).length : null,
        guard: guardBlocks(g) ? "blocked" : "passed",
        result: res,
        expected: e.expected_flags,
        comparison: res && res.status !== "blocked" && res.status !== "capped" ? compareFlags(e.expected_flags, res.flags.map((f) => f.label)) : null,
      };
    });
    setMatrix(rows);
    setCoverage(layerCoverage(excerpts.map((e) => ({ x: e, intervals: intervalsForCoverage(e, nerAll.get(e.id)), ner: nerAll.get(e.id)?.byTurn }))));
    setRunningAll(null);
  }

  async function runLocalSummary() {
    setBusy(true);
    try {
      const turns: Turn[] = scrubExcerpt(x, LAYERS_A, nerByTurn);
      const note = noteFromTurns(turns);
      const r = await summarizeLocally(turns, {
        model: ollamaModel,
        known: buildKnownIdentifiers(x.donor, x.volunteer_name),
        template: { tags: note.tags, counts: note.counts, cueRuleIds: note.cueRuleIds },
      });
      setSummaries((m) => new Map(m).set(x.id, r));
    } finally {
      setBusy(false);
    }
  }

  const sentChars = useMemo(() => new Map(VARIANTS.map((v) => [v, excerpts.reduce((n, e) => n + buildOutbound(e, v).json.length, 0)])), []);
  const variantSummary = matrix ? summarize(matrix, sentChars) : null;
  const allLatencies = [...nerResults.values()].flatMap((r) => r.latencies);
  const templateNote = noteFromTurns(scrubExcerpt(x, LAYERS_A, nerByTurn));
  const llm = summaries.get(x.id);

  const overRedaction = excerpts.map((e) => {
    const r = nerResults.get(e.id);
    const items: Array<{ turnId: string; text: string; type: string; score: number }> = [];
    if (r) {
      for (const t of e.turns) {
        for (const iv of r.byTurn.get(t.id) ?? []) {
          const text = t.raw.slice(iv.start, iv.end);
          const lower = t.raw.toLowerCase();
          const isPlanted = e.planted.some((p) => {
            const v = p.value.toLowerCase();
            for (let i = lower.indexOf(v); i >= 0; i = lower.indexOf(v, i + 1)) if (i < iv.end && iv.start < i + v.length) return true;
            return false;
          });
          if (!isPlanted) items.push({ turnId: t.id, text, type: iv.type, score: iv.score });
        }
      }
    }
    return { id: e.id, ran: !!r, items };
  });

  return (
    <div className="lab">
      <Banner>PROTOTYPE, not final UI. Synthetic data only.</Banner>
      <NetworkStrip />
      <h1>Redaction lab</h1>

      <section className="lab-col">
        <h2>Local model (NER, layer 4)</h2>
        <label>
          NER:{" "}
          <select value={nerSetting} onChange={(e) => setNerSetting(e.target.value as "on" | "off")}>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
        </label>{" "}
        <button onClick={loadModel} disabled={model.state === "loading" || model.state === "ready"}>
          Load NER model from local files
        </button>{" "}
        <label>
          score threshold <input type="number" step="0.01" min="0" max="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <div data-testid="model-status">
          status: <b>{model.state}</b>
          {model.state === "ready" ? `, load ${model.ms} ms, backend ${model.backend}` : ""}
          {model.state === "failed" ? `: ${model.error}` : ""}
          {nerInfo ? `, model ${nerInfo.id} (q8, ${(nerInfo.bytes / 1e6).toFixed(1)} MB)` : ""}
        </div>
        <div>
          per-turn NER latency across {allLatencies.length} turns: p50 {percentile(allLatencies, 50)?.toFixed(0) ?? "n/a"} ms, p95 {percentile(allLatencies, 95)?.toFixed(0) ?? "n/a"} ms
        </div>
      </section>

      <div className="lab-cols">
        <section className="lab-col">
          <h2>Source and layers</h2>
          <Banner raw>Raw text is on screen. It stays in this tab.</Banner>
          <label>
            excerpt{" "}
            <select value={excerptId} onChange={(e) => setExcerptId(e.target.value)} data-testid="excerpt-picker">
              {excerpts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} ({e.review_status})
                </option>
              ))}
            </select>
          </label>
          <div>
            {LAYER_KEYS.map((k) => (
              <label key={k} style={{ marginRight: 10 }}>
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
                <span className={`swatch hl-${k}`} />
                {LAYER_LABEL[k]}
              </label>
            ))}
            <span className="swatch" style={{ background: "#b00000" }} /> planted identifier surviving
          </div>
          {layers.ner && model.state !== "ready" ? <p className="muted">Load the NER model to see layer 4.</p> : null}
          {held ? (
            <div className="held" data-testid="ner-held">
              NER unavailable, turn held ({heldTurnIds.length} turn{heldTurnIds.length === 1 ? "" : "s"}). Nothing from this call can be sent.{" "}
              <button
                onClick={() => {
                  setContinueWithoutNer((s) => new Set(s).add(x.id));
                  setNerResults((m) => {
                    const n = new Map(m);
                    n.delete(x.id);
                    return n;
                  });
                }}
              >
                continue without NER for this call
              </button>
            </div>
          ) : null}
          {continueWithoutNer.has(x.id) ? <span className="badge warn">NER skipped for this call</span> : null}
          <p className="muted">{x.notes}</p>
          {x.turns.map((t) => {
            const { spans, scrubbed } = turnSpans(t, x, selectedLayers, nerOn, nerForExcerpt?.byTurn.get(t.id));
            return (
              <div key={t.id} className="lab-turn">
                <div className="who">
                  {t.speaker.toUpperCase()} {t.id}
                </div>
                <div>
                  <Highlighted text={t.raw} spans={spans} />
                </div>
                <div className="muted">{scrubbed}</div>
              </div>
            );
          })}
        </section>

        <section className="lab-col">
          <h2>Outbound payload</h2>
          <label>
            variant{" "}
            <select value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
              <option value="M">M: masked transcript (layers 1+2)</option>
              <option value="A">A: scrubbed transcript (layers 1-3)</option>
              <option value="N">N: note (summary + tags), the real design</option>
            </select>
          </label>
          {nerOn ? <div className="muted">NER layer applied to this payload.</div> : null}
          <h3>Exact JSON body</h3>
          <pre data-testid="outbound-json">{outbound.json}</pre>
          <h3>Ledger</h3>
          <div data-testid="ledger">
            stayed on this device: <b>{ledger.stayedChars}</b> chars, sent: <b>{ledger.sentChars}</b> chars
          </div>
          <div>
            planted identifiers in this payload: {survivors.length} of {x.planted.length}
            {survivors.length ? ` (${survivors.map((s) => s.type).join(", ")})` : ""}
          </div>
          <h3>Local guard</h3>
          <GuardCounts c={guard} />
          <div>
            <button onClick={checkRemoteGuard}>Check with server guard</button>
            {remoteGuard ? (
              <div>
                server: <GuardCounts c={remoteGuard.guard_counts} /> | Comprehend: {remoteGuard.comprehend ? Object.entries(remoteGuard.comprehend).map(([k, v]) => `${k} ${v}`).join(", ") || "none" : "null (disabled)"}
              </div>
            ) : null}
          </div>
          <button onClick={send} disabled={busy || held} data-testid="send">
            Send to Bedrock
          </button>
          {error ? <div className="badge bad">{error}</div> : null}
        </section>

        <section className="lab-col">
          <h2>Bedrock result</h2>
          <ResultView result={result} expected={x.expected_flags} />
          <h2>Summary: template vs local LLM</h2>
          <p className="muted">Optional. Needs `ollama serve` on 127.0.0.1:11434. Input is the scrubbed turns.</p>
          <label>
            model <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} style={{ width: 120 }} />
          </label>
          <button onClick={runLocalSummary} disabled={busy || held}>
            Run local LLM summary
          </button>
          <table>
            <tbody>
              <tr>
                <th>template</th>
                <td>
                  {templateNote.summary}
                  <div className="muted">tags: {templateNote.tags.join(", ") || "(none)"}</div>
                </td>
              </tr>
              <tr>
                <th>local LLM</th>
                <td>
                  {llm ? (
                    llm.source === "llm" ? (
                      <>
                        {llm.summary}
                        <div className="muted">
                          tags: {llm.tags.join(", ") || "(none)"}; {llm.latency_ms} ms; dropped tags: {llm.dropped_tags.join(", ") || "none"}; rule tags missing:{" "}
                          {templateNote.tags.filter((t) => !llm.tags.includes(t)).join(", ") || "none"}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="badge bad">LLM summary rejected ({llm.rejected})</span> fell back to template. {llm.latency_ms} ms
                      </>
                    )
                  ) : (
                    <span className="muted">not run</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section className="lab-col" style={{ marginTop: 12 }}>
        <h2>Run all</h2>
        <button onClick={runAll} disabled={!!runningAll} data-testid="run-all">
          Run all (10 excerpts x 3 variants)
        </button>
        {runningAll ? <span> {runningAll}</span> : null}
        {matrix ? (
          <>
            {" "}
            <button onClick={() => download("redaction-lab-matrix.csv", matrixCsv(matrix))}>Export CSV</button>
            <table data-testid="matrix">
              <thead>
                <tr>
                  <th>excerpt</th>
                  <th>variant</th>
                  <th>planted surviving (NER off)</th>
                  <th>planted surviving (NER on)</th>
                  <th>guard</th>
                  <th>status</th>
                  <th>flags returned</th>
                  <th>expected</th>
                  <th>correct / missing / extra</th>
                  <th>latency</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={`${r.excerptId}-${r.variant}`}>
                    <td>{r.excerptId}</td>
                    <td>{r.variant}</td>
                    <td>
                      {r.survivorsNerOff} of {r.plantedTotal}
                    </td>
                    <td>{r.survivorsNerOn === null ? "n/a" : `${r.survivorsNerOn} of ${r.plantedTotal}`}</td>
                    <td>{r.guard}</td>
                    <td>
                      {r.result?.status ?? "error"} {r.result?.mock ? <span className="badge mock">MOCK</span> : null}
                    </td>
                    <td>{r.result?.flags.map((f) => f.label).join(", ") || "none"}</td>
                    <td>{r.expected.join(", ") || "none"}</td>
                    <td>
                      {r.comparison ? `${r.comparison.correct.join(" ") || "-"} / ${r.comparison.missing.join(" ") || "-"} / ${r.comparison.extra.join(" ") || "-"}` : "n/a"}
                    </td>
                    <td>{r.result?.latency_ms ?? ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {variantSummary?.map((s) => (
                  <tr key={s.variant}>
                    <th>summary</th>
                    <th>{s.variant}</th>
                    <th>
                      {s.survivorsNerOff} of {s.plantedTotal}
                    </th>
                    <th>{s.survivorsNerOn === null ? "n/a" : `${s.survivorsNerOn} of ${s.plantedTotal}`}</th>
                    <th colSpan={4}>
                      {s.found} of {s.expectedTotal} expected flags found, {s.extra} extra {s.mock ? <span className="badge mock">MOCK</span> : null}
                    </th>
                    <th>{s.calls} calls</th>
                    <th>
                      mean {s.meanLatencyMs ?? "n/a"} ms, {s.totalTokens} tokens, {s.sentChars} chars sent
                    </th>
                  </tr>
                ))}
              </tfoot>
            </table>
          </>
        ) : null}
        {coverage ? (
          <>
            <h3>Layer coverage (planted identifiers, counts)</h3>
            <CoverageTable rows={coverage} />
          </>
        ) : null}
        <h3>NER over-redaction list (NER spans not in the planted set; for human review)</h3>
        {overRedaction.every((o) => !o.ran) ? <p className="muted">Run NER (load the model, then Run all) to populate.</p> : null}
        {overRedaction
          .filter((o) => o.ran)
          .map((o) => (
            <div key={o.id}>
              <b>{o.id}</b>: {o.items.length ? "" : "none"}
              <ul>
                {o.items.map((it, i) => (
                  <li key={i}>
                    {it.turnId}: "{it.text}" as {it.type}, score {it.score.toFixed(3)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
    </div>
  );
}
