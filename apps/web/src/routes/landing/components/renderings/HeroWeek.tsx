import { cn } from "cn";
import { Avatar, Backdrop, Bar, Canvas, CanvasEdge, Panel, Pill, Tick, type Tone } from "./kit.tsx";

const ROWS: { initials: string; name: string; reason: string; tone: Tone; status: [Tone, string] }[] = [
  { initials: "MR", name: "Maya R.", reason: "First gift anniversary", tone: "sage", status: ["sage", "Brief approved"] },
  { initials: "TB", name: "Theo B.", reason: "Asked for a program update", tone: "sky", status: ["butter", "Needs a brief"] },
  { initials: "JK", name: "June K.", reason: "Renewed after a pause", tone: "blush", status: ["sage", "Brief approved"] },
  { initials: "AD", name: "Arturo D.", reason: "New monthly supporter", tone: "butter", status: ["blush", "Follow-up due"] },
  { initials: "PS", name: "Priya S.", reason: "Came to the spring event", tone: "sky", status: ["sage", "Brief approved"] },
];

const NAV = ["This week", "Briefs", "Follow-ups", "Ledger"];

/** Hero illustration: a coordinator's week, the approved-note ledger, and the review, joined by live edges. */
export function HeroWeek() {
  return (
    <Canvas>
      <Backdrop a="sage" b="sky" />
      <Panel className="absolute top-7 left-7 flex h-[444px] w-[470px] overflow-hidden">
        <aside className="flex w-[128px] flex-col gap-1 border-r border-(--lp-line) bg-(--lp-bg)/70 p-4">
          <span className="mb-4 text-[14px] font-semibold tracking-tight">CallCoach</span>
          {NAV.map((n, i) => (
            <span key={n} className={cn("rounded-lg px-2.5 py-1.5 text-[11.5px]", i === 0 ? "bg-(--lp-sage-soft) font-medium text-(--lp-sage-ink)" : "text-(--lp-ink-soft)")}>
              {n}
            </span>
          ))}
          <div className="mt-auto rounded-xl bg-(--lp-butter-soft) p-3">
            <span className="text-[10.5px] font-medium text-(--lp-butter-ink)">2 follow-ups due</span>
            <Bar w="80%" className="mt-2" />
          </div>
        </aside>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-medium">This week's calls</p>
              <p className="text-[10.5px] text-(--lp-ink-soft)">Spring thank-you round</p>
            </div>
            <Pill tone="sky">3 callers</Pill>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {ROWS.map((r, i) => (
              <li key={r.name} className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-2", i === 0 ? "border-(--lp-sage)/60 bg-(--lp-sage-soft)/40" : "border-(--lp-line)")}>
                <Avatar initials={r.initials} tone={r.tone} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium">{r.name}</p>
                  <p className="truncate text-[10px] text-(--lp-ink-soft)">{r.reason}</p>
                </div>
                <Pill tone={r.status[0]} className="!px-2 !text-[10px]">
                  {r.status[1]}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <CanvasEdge d="M497 112 C 522 112, 523 262, 548 262" from={[497, 112]} to={[548, 262]} />

      <Panel className="absolute top-[156px] left-[548px] h-[214px] w-[224px] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium">Ready to send</span>
          <Pill tone="sage">Approved</Pill>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-[11px]">
          <li className="flex items-center gap-2">
            <Tick /> Short summary
          </li>
          <li className="flex items-center gap-2">
            <Tick /> Tags: thanked, update asked
          </li>
          <li className="flex items-center gap-2">
            <Tick /> Follow-up: send report
          </li>
        </ul>
        <div className="mt-3 rounded-lg bg-(--lp-blush-soft) px-2.5 py-1.5 text-[10.5px] text-(--lp-blush-ink)">Call notes stay on this device</div>
        <div className="mt-2.5 rounded-lg bg-(--lp-ink) py-2 text-center text-[11px] font-medium text-(--lp-bg)">Send approved note</div>
      </Panel>

      <CanvasEdge d="M660 370 L 660 412" from={[660, 370]} to={[660, 412]} delay={1.2} />

      <Panel className="absolute top-[412px] left-[548px] flex w-[224px] items-center gap-2.5 px-3.5 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-(--lp-sage-soft) text-[12px] text-(--lp-sage-ink)">✓</span>
        <div>
          <p className="text-[11px] font-medium">Coordinator reviewed</p>
          <p className="text-[10px] text-(--lp-ink-soft)">1 suggested flag accepted</p>
        </div>
      </Panel>
    </Canvas>
  );
}
