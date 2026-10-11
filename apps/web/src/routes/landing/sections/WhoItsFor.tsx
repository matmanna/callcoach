import { ArrowRightIcon, ChurchIcon, GraduationCapIcon, SoupIcon, UsersRoundIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { spotlight } from "../components/motion.tsx";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { whoItsFor } from "../copy.ts";

const ICONS = { student: GraduationCapIcon, campus: UsersRoundIcon, church: ChurchIcon, soup: SoupIcon };
const TINTS = [
  { icon: "bg-(--lp-sage-soft) text-(--lp-sage-ink)", spot: "var(--lp-sage)" },
  { icon: "bg-(--lp-sky-soft) text-(--lp-sky-ink)", spot: "var(--lp-sky)" },
  { icon: "bg-(--lp-blush-soft) text-(--lp-blush-ink)", spot: "var(--lp-blush)" },
  { icon: "bg-(--lp-butter-soft) text-(--lp-butter-ink)", spot: "var(--lp-butter)" },
];

export function WhoItsFor() {
  return (
    <section id="who-its-for" aria-labelledby="who-its-for-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container>
        <SectionHeading id="who-its-for-title" eyebrow={whoItsFor.eyebrow} title={whoItsFor.title} />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {whoItsFor.tiles.map((tile, i) => {
            const Icon = ICONS[tile.icon];
            const tint = TINTS[i]!;
            return (
              <li key={tile.title}>
                <article
                  tabIndex={0}
                  onPointerMove={spotlight}
                  style={{ "--spot": tint.spot } as CSSProperties}
                  className="lp-lift lp-spot lp-rim group flex h-full gap-5 rounded-2xl border border-(--lp-hairline) bg-(--lp-surface) p-6 shadow-(--lp-shadow) outline-none sm:p-7"
                >
                  <span className={`lp-icon flex size-11 shrink-0 items-center justify-center rounded-xl ${tint.icon}`}>
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-xl leading-snug">{tile.title}</h3>
                    <p className="mt-2 leading-relaxed text-(--lp-ink-soft)">{tile.body}</p>
                    <p className="mt-4 flex items-center gap-1.5 text-sm text-(--lp-ink)">
                      {tile.fits}
                      <ArrowRightIcon className="lp-arrow size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
