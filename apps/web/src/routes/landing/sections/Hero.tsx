import { Button } from "@/components/ui/button";
import { ArrowDownIcon } from "lucide-react";
import type { Ref } from "react";
import { Ripple } from "../components/motion.tsx";
import { HeroWeek } from "../components/renderings/HeroWeek.tsx";
import { RecordingSlot } from "../components/RecordingSlot.tsx";
import { Container } from "../components/SectionHeading.tsx";
import { hero } from "../copy.ts";

/** Stops "follow-through" from breaking at its hyphen in the large headline. */
function keepHyphenatedWords(text: string) {
  return text.split(/(\S+-\S+)/).map((part, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{part}</span> : part));
}

/** Headline with one phrase on a soft highlighter. */
function Headline() {
  const at = hero.title.indexOf(hero.highlight);
  if (at < 0) return <>{keepHyphenatedWords(hero.title)}</>;
  return (
    <>
      {keepHyphenatedWords(hero.title.slice(0, at))}
      <span className="lp-mark">{hero.highlight}</span>
      {hero.title.slice(at + hero.highlight.length)}
    </>
  );
}

export function Hero({ sentinel }: { sentinel: Ref<HTMLDivElement> }) {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative scroll-mt-16">
      <div aria-hidden="true" className="lp-wash absolute inset-x-0 -top-16 h-[44rem]" />
      <div aria-hidden="true" className="lp-dots absolute inset-x-0 -top-16 h-[40rem]" />
      <Container className="relative pt-14 pb-12 sm:pt-24 sm:pb-16">
        <p className="lp-eyebrow inline-flex items-center gap-2 rounded-full border border-(--lp-hairline) bg-white/70 px-3 py-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-(--lp-sage)" />
          {hero.eyebrow}
        </p>
        <h1 id="hero-title" className="mt-5 max-w-4xl text-[2.5rem] leading-[1.08] sm:text-6xl lg:text-[4.25rem]">
          <Headline />
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-(--lp-ink-soft) sm:text-xl">{hero.subtitle}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild size="lg" className="lp-press relative h-12 overflow-hidden rounded-xl px-6 text-base">
            <a href="#how-it-works">
              <Ripple />
              {hero.primaryCta}
              <ArrowDownIcon data-icon="inline-end" className="lp-nudge" strokeWidth={1.75} aria-hidden="true" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="lp-press relative h-12 overflow-hidden rounded-xl border-(--lp-hairline) bg-white/70 px-6 text-base hover:bg-white">
            <a href="#contact">
              <Ripple />
              {hero.secondaryCta}
            </a>
          </Button>
        </div>
      </Container>
      {/* The frame sits across the seam between the page and a sage tint that fades out below. */}
      <div className="relative">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 bottom-0 bg-(--lp-sage-soft)" />
        <Container className="relative">
          <RecordingSlot recording={hero.recording} placeholder={<HeroWeek />} className="mx-auto max-w-5xl" />
        </Container>
      </div>
      <div ref={sentinel} aria-hidden="true" className="h-12 bg-linear-to-b from-(--lp-sage-soft) to-transparent sm:h-16" />
    </section>
  );
}
