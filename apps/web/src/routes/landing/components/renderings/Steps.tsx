/** One illustration per "How it works" step: static mock screens joined by live edges. */
import { cn } from "cn";
import { Avatar, Backdrop, Bar, Canvas, CanvasEdge, Panel, Pill, Shift, Tick, type Tone } from "./kit.tsx";

export function PlanStep() {
  const rows: [string, string, Tone, string][] = [
    ["MR", "Maya R.", "sage", "First gift anniversary"],
    ["TB", "Theo B.", "sky", "Asked for an update"],
    ["JK", "June K.", "blush", "Renewed after a pause"],
    ["AD", "Arturo D.", "butter", "New monthly supporter"],
  ];
  return (
    <Canvas>
      <Backdrop a="sage" b="sky" />
      <Shift y={44}>
      <Panel className="absolute top-10 left-10 w-[460px] p-5">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-medium">Build this week's list</p>
          <Pill tone="sage">4 selected</Pill>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map(([ini, name, tone, reason]) => (
            <li key={name} className="flex items-center gap-3 rounded-xl border border-(--lp-line) px-3 py-2.5">
              <Tick />
              <Avatar initials={ini} tone={tone} size={28} />
              <span className="w-[86px] text-[12.5px] font-medium">{name}</span>
              <Pill tone={tone}>Reason: {reason}</Pill>
            </li>
          ))}
        </ul>
      </Panel>
      <CanvasEdge d="M500 160 C 515 160, 515 290, 530 290" from={[500, 160]} to={[530, 290]} />
      <Panel className="absolute top-[200px] left-[530px] w-[230px] p-4">
        <p className="text-[12.5px] font-medium">Assign callers</p>
        {(
          [
            ["S", "Sam", "sky", "2 calls"],
            ["R", "Rae", "blush", "1 call"],
            ["L", "Lu", "butter", "1 call"],
          ] as const
        ).map(([i, n, t, c]) => (
          <div key={n} className="mt-2.5 flex items-center gap-2">
            <Avatar initials={i} tone={t} size={24} />
            <span className="flex-1 text-[12px]">{n}</span>
            <span className="text-[11px] text-(--lp-ink-soft)">{c}</span>
          </div>
        ))}
        <div className="mt-3 rounded-lg bg-(--lp-ink) py-2 text-center text-[11.5px] font-medium text-(--lp-bg)">Coordinator confirms</div>
      </Panel>
      </Shift>
    </Canvas>
  );
}

export function PrepareStep() {
  return (
    <Canvas>
      <Backdrop a="butter" b="blush" />
      <Shift y={22}>
      <Panel className="absolute top-10 left-10 w-[420px] p-6">
        <div className="flex items-center gap-3">
          <Avatar initials="MR" tone="sage" size={36} />
          <div>
            <p className="text-[16px] font-medium">Brief: Maya R.</p>
            <p className="text-[11px] text-(--lp-ink-soft)">For Sam · approved by the coordinator</p>
          </div>
        </div>
        <p className="lp-eyebrow mt-5 !text-[10px]">Before you call</p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {["Thank her for a first year of giving", "She asked how the reading program is going", "Keep it short; she prefers evenings"].map((t) => (
            <li key={t} className="flex items-start gap-2 text-[12.5px]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--lp-butter-ink)/60" />
              {t}
            </li>
          ))}
        </ul>
        <p className="lp-eyebrow mt-5 !text-[10px]">Open follow-ups</p>
        <div className="mt-2 rounded-xl bg-(--lp-blush-soft) px-3 py-2.5 text-[12px] text-(--lp-blush-ink)">Send the spring program report · due Fri</div>
      </Panel>
      <CanvasEdge d="M460 150 C 480 150, 480 250, 500 250" from={[460, 150]} to={[500, 250]} />
      <Panel className="absolute top-[180px] left-[500px] w-[260px] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium">Fact card</span>
          <Pill tone="sky">Approved</Pill>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed">The reading program runs at four library branches this spring.</p>
        <p className="mt-3 border-t border-(--lp-line) pt-2 text-[10.5px] text-(--lp-ink-soft)">Source: program fact sheet · Sep 2026</p>
      </Panel>
      </Shift>
    </Canvas>
  );
}

/** Placeholder chip that replaced an identifier in the note. */
function Chip({ children }: { children: string }) {
  return <span className="rounded-md bg-(--lp-sky-soft) px-1.5 py-0.5 font-mono text-[10.5px] text-(--lp-sky-ink)">{children}</span>;
}

export function RecordStep() {
  return (
    <Canvas>
      <Backdrop a="sky" b="sage" />
      <Shift y={62}>
      <Panel className="absolute top-10 left-10 w-[430px] p-6">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-medium">Your note</p>
          <Pill tone="sky">Checked on this device</Pill>
        </div>
        <div className="mt-4 rounded-xl border border-(--lp-line) bg-(--lp-bg)/60 p-4 text-[13px] leading-[2.1]">
          Thanked <Chip>[NAME]</Chip> for her first year. She asked for the program report, sent to <Chip>[EMAIL]</Chip>. Call back at <Chip>[PHONE]</Chip> next month.
        </div>
        <div className="mt-4 flex gap-2">
          <Pill tone="sage">3 identifiers removed</Pill>
          <Pill tone="butter">Review before sending</Pill>
        </div>
      </Panel>
      <CanvasEdge d="M470 170 C 490 170, 490 245, 510 245" from={[470, 170]} to={[510, 245]} />
      <Panel className="absolute top-[160px] left-[510px] w-[250px] p-4">
        <p className="text-[12.5px] font-medium">What will be sent</p>
        <ul className="mt-3 flex flex-col gap-2 text-[11.5px]">
          <li className="flex items-center gap-2">
            <Tick /> Two-sentence summary
          </li>
          <li className="flex items-center gap-2">
            <Tick /> Tags: thanked, report asked
          </li>
          <li className="flex items-center gap-2 text-(--lp-ink-soft)">
            <Tick done={false} /> Your full note stays here
          </li>
        </ul>
        <div className="mt-3 rounded-lg bg-(--lp-ink) py-2 text-center text-[11.5px] font-medium text-(--lp-bg)">Approve and send</div>
      </Panel>
      </Shift>
    </Canvas>
  );
}

export function FollowStep() {
  const tasks: [string, string, Tone, string, Tone][] = [
    ["Send the spring program report", "S", "sky", "Due Fri", "butter"],
    ["Invite to the volunteer open house", "R", "blush", "Due next week", "sage"],
    ["Call back about matching gift", "L", "butter", "Overdue 1 day", "blush"],
    ["Mail a handwritten card", "S", "sky", "Done", "sage"],
  ];
  return (
    <Canvas>
      <Backdrop a="sky" b="butter" />
      <Shift y={48}>
      <Panel className="absolute top-10 left-10 w-[470px] p-5">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-medium">Follow-ups</p>
          <Pill tone="blush">1 overdue</Pill>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {tasks.map(([t, o, tone, due, dueTone]) => (
            <li key={t} className={cn("flex items-center gap-3 rounded-xl border border-(--lp-line) px-3 py-2.5", dueTone === "blush" && "bg-(--lp-blush-soft)/60")}>
              <Tick done={due === "Done"} />
              <span className={cn("flex-1 text-[12.5px]", due === "Done" && "text-(--lp-ink-soft) line-through")}>{t}</span>
              <Avatar initials={o} tone={tone} size={24} />
              <Pill tone={dueTone} className="w-[96px] justify-center">
                {due}
              </Pill>
            </li>
          ))}
        </ul>
      </Panel>
      <CanvasEdge d="M510 200 C 525 200, 525 290, 540 290" from={[510, 200]} to={[540, 290]} />
      <Panel className="absolute top-[210px] left-[540px] w-[220px] p-4">
        <p className="text-[12.5px] font-medium">This round</p>
        <div className="mt-3 flex items-center gap-3">
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--lp-sage-soft)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--lp-sage)" strokeWidth="4" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset={25} />
          </svg>
          <div>
            <p className="text-[18px] font-medium">3 of 4</p>
            <p className="text-[11px] text-(--lp-ink-soft)">calls made</p>
          </div>
        </div>
        <Bar w="70%" className="mt-3" />
      </Panel>
      </Shift>
    </Canvas>
  );
}
