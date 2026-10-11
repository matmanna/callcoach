import { useState, type ComponentType, type CSSProperties } from "react";
import { Flowchart } from "../components/Flowchart.tsx";
import { RecordingSlot } from "../components/RecordingSlot.tsx";
import { FollowStep, PlanStep, PrepareStep, RecordStep } from "../components/renderings/Steps.tsx";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { howItWorks } from "../copy.ts";

const PANEL_ID = "how-it-works-panel";
const AUTO_MS = 7000;
const ILLUSTRATIONS: Record<(typeof howItWorks.steps)[number]["key"], ComponentType> = {
  plan: PlanStep,
  prepare: PrepareStep,
  record: RecordStep,
  follow: FollowStep,
};

/**
 * Steps advance on their own every few seconds until the visitor picks one; hovering or
 * focusing the section pauses the timer. Reduced motion turns auto-advance off.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const step = howItWorks.steps[active]!;
  const Illustration = ILLUSTRATIONS[step.key];
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="lp-band scroll-mt-16 py-20 sm:py-28"
      style={{ "--band": "var(--lp-butter-soft)" } as CSSProperties}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Container>
        <SectionHeading id="how-it-works-title" eyebrow={howItWorks.eyebrow} title={howItWorks.title} />
        <div className="mt-12">
          <Flowchart
            steps={howItWorks.steps}
            active={active}
            onSelect={(i) => {
              setAuto(false);
              setActive(i);
            }}
            autoMs={auto ? AUTO_MS : undefined}
            paused={paused}
            onAdvance={() => setActive((i) => (i + 1) % howItWorks.steps.length)}
            panelId={PANEL_ID}
            label="How it works, step by step"
          />
        </div>
        <div id={PANEL_ID} role="tabpanel" aria-labelledby={`flow-tab-${step.key}`} className="mt-8">
          <RecordingSlot recording={step.recording} placeholder={<Illustration />} className="mx-auto max-w-4xl" />
        </div>
      </Container>
    </section>
  );
}
