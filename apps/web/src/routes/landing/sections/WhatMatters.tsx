import { BookOpenTextIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { spotlight } from "../components/motion.tsx";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { whatMatters } from "../copy.ts";

const ICONS = { people: UsersRoundIcon, shield: ShieldCheckIcon, book: BookOpenTextIcon };
const TINTS = [
  { icon: "bg-(--lp-sage-soft) text-(--lp-sage-ink)", spot: "var(--lp-sage)" },
  { icon: "bg-(--lp-sky-soft) text-(--lp-sky-ink)", spot: "var(--lp-sky)" },
  { icon: "bg-(--lp-butter-soft) text-(--lp-butter-ink)", spot: "var(--lp-butter)" },
];

export function WhatMatters() {
  return (
    <section aria-labelledby="what-matters-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading id="what-matters-title" eyebrow={whatMatters.eyebrow} title={whatMatters.title} />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {whatMatters.cards.map((card, i) => {
            const Icon = ICONS[card.icon];
            const tint = TINTS[i]!;
            return (
              <li key={card.title}>
                <article
                  tabIndex={0}
                  onPointerMove={spotlight}
                  style={{ "--spot": tint.spot } as CSSProperties}
                  className="lp-lift lp-spot lp-rim group flex h-full flex-col rounded-2xl border border-(--lp-hairline) bg-(--lp-surface) p-7 shadow-(--lp-shadow) outline-none"
                >
                  <span className={`lp-icon flex size-11 items-center justify-center rounded-xl ${tint.icon}`}>
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl leading-snug">{card.title}</h3>
                  <p className="mt-3 leading-relaxed text-(--lp-ink-soft)">{card.body}</p>
                </article>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
