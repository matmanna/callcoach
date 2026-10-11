import { cn } from "cn";
import { useState } from "react";
import { Avatar, Backdrop, Bar, Canvas, CanvasEdge, Panel, Pill, Tick, type Tone } from "./kit.tsx";

type Status = "approved" | "needs-brief" | "follow-up";
type Row = { id: string; initials: string; name: string; reason: string; tone: Tone; status: Status; summary: string };

const ROWS: Row[] = [
  { id: "maya", initials: "MR", name: "Maya R.", reason: "First gift anniversary", tone: "sage", status: "approved", summary: "Thanked for the anniversary gift. Asked about the mentoring program." },
  { id: "theo", initials: "TB", name: "Theo B.", reason: "Asked for a program update", tone: "sky", status: "needs-brief", summary: "Wants a short program update. Brief not approved yet." },
  { id: "june", initials: "JK", name: "June K.", reason: "Renewed after a pause", tone: "blush", status: "approved", summary: "Welcomed back. Prefers a call in the evening." },
  { id: "arturo", initials: "AD", name: "Arturo D.", reason: "New monthly supporter", tone: "butter", status: "follow-up", summary: "Thanked for setting up monthly giving. Send the welcome pack." },
  { id: "priya", initials: "PS", name: "Priya S.", reason: "Came to the spring event", tone: "sky", status: "approved", summary: "Asked how the spring event helped. Shared a photo from the day." },
];

const TABS = [
  { id: "week", label: "This week", heading: "This week's calls" },
  { id: "briefs", label: "Briefs", heading: "Briefs to review" },
  { id: "follow", label: "Follow-ups", heading: "Follow-ups due" },
  { id: "ledger", label: "Ledger", heading: "What left this device" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<Status, [Tone, string]> = {
  approved: ["sage", "Brief approved"],
  "needs-brief": ["butter", "Needs a brief"],
  "follow-up": ["blush", "Follow-up due"],
};

const LEDGER = [
  "Approved summary, 3 tags",
  "Scrub counts: 2 names, 1 phone",
  "Follow-up: send report",
];

/**
 * Hero illustration you can use: switch the tabs, pick a donor to see their summary, and send
 * an approved note. Purely local state: nothing is sent anywhere, and the sample names are made up.
 */
export function HeroWeek() {
  const [tab, setTab] = useState<TabId>("week");
  const [selected, setSelected] = useState(0);
  const [sent, setSent] = useState<string[]>([]);
  const row = ROWS[selected]!;
  const canSend = row.status === "approved" && !sent.includes(row.id);
  const heading = TABS.find((t) => t.id === tab)!.heading;
  const visible = tab === "briefs" ? ROWS.filter((r) => r.status !== "approved") : tab === "follow" ? ROWS.filter((r) => r.status === "follow-up") : ROWS;

  return (
    <Canvas interactive>
      <Backdrop a="sage" b="sky" />
      <Panel className="absolute top-7 left-7 flex h-[444px] w-[470px] overflow-hidden">
        <nav aria-label="Demo sections" className="flex w-[128px] flex-col gap-1 border-r border-(--lp-line) bg-(--lp-bg)/70 p-4">
          <span className="mb-4 text-[14px] font-semibold tracking-tight">CallCoach</span>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors hover:bg-(--lp-sage-soft)/60 focus-visible:outline-2 focus-visible:outline-(--lp-sage-ink)", tab === t.id ? "bg-(--lp-sage-soft) font-medium text-(--lp-sage-ink)" : "text-(--lp-ink-soft)")}
            >
              {t.label}
            </button>
          ))}
          <div className="mt-auto rounded-xl bg-(--lp-butter-soft) p-3">
            <span className="text-[10.5px] font-medium text-(--lp-butter-ink)">2 follow-ups due</span>
            <Bar w="80%" className="mt-2" />
          </div>
        </nav>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-medium">{heading}</p>
              <p className="text-[10.5px] text-(--lp-ink-soft)">Spring thank-you round</p>
            </div>
            <Pill tone="sky">3 callers</Pill>
          </div>

          {tab === "ledger" ? (
            <ul className="mt-3 flex flex-col gap-1.5 text-[11px]" aria-label="Ledger entries">
              {LEDGER.map((line) => (
                <li key={line} className="flex items-center gap-2 rounded-xl border border-(--lp-line) px-2.5 py-2">
                  <Tick /> {line}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5" aria-label={heading}>
              {visible.map((r) => {
                const i = ROWS.indexOf(r);
                const isSel = i === selected;
                const [tone, label] = STATUS_LABEL[r.status];
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => setSelected(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors hover:bg-(--lp-bg)/60 focus-visible:outline-2 focus-visible:outline-(--lp-sage-ink)",
                        isSel ? "border-(--lp-sage)/60 bg-(--lp-sage-soft)/40" : "border-(--lp-line)",
                      )}
                    >
                      <Avatar initials={r.initials} tone={r.tone} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-medium">{r.name}</span>
                        <span className="block truncate text-[10px] text-(--lp-ink-soft)">{r.reason}</span>
                      </span>
                      <Pill tone={tone} className="!px-2 !text-[10px]">
                        {label}
                      </Pill>
                    </button>
                  </li>
                );
              })}
              {!visible.length ? <li className="px-2.5 py-2 text-[11px] text-(--lp-ink-soft)">Nothing waiting here.</li> : null}
            </ul>
          )}
        </div>
      </Panel>

      <CanvasEdge d="M497 112 C 522 112, 523 262, 548 262" from={[497, 112]} to={[548, 262]} />

      <Panel className="absolute top-[156px] left-[548px] h-[214px] w-[224px] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium">{row.name}</span>
          <Pill tone={STATUS_LABEL[row.status][0]}>{STATUS_LABEL[row.status][1]}</Pill>
        </div>
        <p aria-live="polite" className="mt-3 text-[11px] leading-snug text-(--lp-ink-soft)">{row.summary}</p>
        <ul className="mt-3 flex flex-col gap-2 text-[11px]">
          <li className="flex items-center gap-2">
            <Tick done={row.status !== "needs-brief"} /> Short summary
          </li>
          <li className="flex items-center gap-2">
            <Tick done={row.status === "approved"} /> Coordinator review
          </li>
        </ul>
        <div className="mt-3 rounded-lg bg-(--lp-blush-soft) px-2.5 py-1.5 text-[10.5px] text-(--lp-blush-ink)">Call notes stay on this device</div>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => setSent((s) => [...s, row.id])}
          className="mt-2.5 w-full rounded-lg bg-(--lp-ink) py-2 text-center text-[11px] font-medium text-(--lp-bg) transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-(--lp-sage-ink) disabled:opacity-40"
        >
          {sent.includes(row.id) ? "Sent to the donor record" : canSend ? "Send approved note" : "Needs an approved brief"}
        </button>
      </Panel>

      <CanvasEdge d="M660 370 L 660 412" from={[660, 370]} to={[660, 412]} delay={1.2} />

      <Panel className="absolute top-[412px] left-[548px] flex w-[224px] items-center gap-2.5 px-3.5 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-(--lp-sage-soft) text-[12px] text-(--lp-sage-ink)">{sent.length ? sent.length : "✓"}</span>
        <div>
          <p className="text-[11px] font-medium">{sent.length ? `${sent.length} note${sent.length === 1 ? "" : "s"} sent this visit` : "Coordinator reviewed"}</p>
          <p className="text-[10px] text-(--lp-ink-soft)">{sent.length ? "Demo only. Nothing leaves this page." : "1 suggested flag accepted"}</p>
        </div>
      </Panel>
    </Canvas>
  );
}
