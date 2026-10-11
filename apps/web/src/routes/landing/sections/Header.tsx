import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MenuIcon } from "lucide-react";
import { Link } from "react-router";
import { Container } from "../components/SectionHeading.tsx";
import { brand, hero, nav } from "../copy.ts";

/** Sticky header. Transparent over the hero, solid once the hero has scrolled past (`solid`). */
export function Header({ solid }: { solid: boolean }) {
  return (
    <header data-solid={solid} className="lp-header sticky top-0 z-40 backdrop-blur-[2px]">
      <Container className="flex h-16 items-center gap-6">
        <a href="#top" className="text-lg font-semibold tracking-tight">
          {brand.name}
        </a>
        <nav aria-label="Page sections" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="lp-navlink mx-3 py-1 text-(--lp-ink-soft) hover:text-(--lp-ink)">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" className="h-9 rounded-xl px-3">
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="lp-press h-9 rounded-xl px-4">
            <a href="#contact">{hero.secondaryCta}</a>
          </Button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="ml-auto rounded-xl md:hidden" aria-label="Open menu">
              <MenuIcon strokeWidth={1.5} />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="landing w-[min(20rem,85vw)] border-none px-6 pt-14">
            <SheetTitle className="text-lg font-semibold">{brand.name}</SheetTitle>
            <nav aria-label="Page sections (mobile)">
              <ul className="flex flex-col gap-1 text-base">
                {nav.map((n) => (
                  <li key={n.href}>
                    <SheetClose asChild>
                      <a href={n.href} className="block rounded-lg py-2.5 text-(--lp-ink-soft) hover:text-(--lp-ink)">
                        {n.label}
                      </a>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 flex flex-col gap-2">
              <SheetClose asChild>
                <Button asChild className="h-11 rounded-xl">
                  <a href="#contact">{hero.secondaryCta}</a>
                </Button>
              </SheetClose>
              <Button asChild variant="ghost" className="h-11 rounded-xl">
                <Link to="/sign-in">Sign in</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  );
}
