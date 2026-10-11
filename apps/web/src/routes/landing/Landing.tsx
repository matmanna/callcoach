import { useEffect, useRef, useState } from "react";
import { Testimonials, type Testimonial } from "./components/Testimonials.tsx";
import { brand } from "./copy.ts";
import "./landing.css";
import { Contact } from "./sections/Contact.tsx";
import { Examples } from "./sections/Examples.tsx";
import { Faq } from "./sections/Faq.tsx";
import { Footer } from "./sections/Footer.tsx";
import { Header } from "./sections/Header.tsx";
import { Hero } from "./sections/Hero.tsx";
import { HowItWorks } from "./sections/HowItWorks.tsx";
import { Principles } from "./sections/Principles.tsx";
import { WhatMatters } from "./sections/WhatMatters.tsx";
import { WhoItsFor } from "./sections/WhoItsFor.tsx";

/** Add a testimonial only with written permission and a named source. Empty hides the section. */
const TESTIMONIALS: Testimonial[] = [];

/** Public marketing page at `/`. No auth, no session, no app data. */
export function Landing() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    document.title = brand.name;
    // Smooth in-page scrolling, offset for the sticky header; skipped under reduced motion.
    const html = document.documentElement;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const prev = { behavior: html.style.scrollBehavior, padding: html.style.scrollPaddingTop };
    if (!reduce) html.style.scrollBehavior = "smooth";
    html.style.scrollPaddingTop = "4.5rem";
    return () => {
      html.style.scrollBehavior = prev.behavior;
      html.style.scrollPaddingTop = prev.padding;
    };
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSolid(!!e && !e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-(--lp-surface) focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Header solid={solid} />
      <main id="main">
        <Hero sentinel={sentinel} />
        <WhatMatters />
        <HowItWorks />
        <WhoItsFor />
        <Examples />
        <Testimonials items={TESTIMONIALS} />
        <Principles />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
