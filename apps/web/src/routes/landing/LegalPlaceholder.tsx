import { Link } from "react-router";
import { Container } from "./components/SectionHeading.tsx";
import { brand, placeholderPages } from "./copy.ts";
import "./landing.css";

/** Placeholder privacy and terms pages linked from the landing footer. */
export function LegalPlaceholder({ page }: { page: keyof typeof placeholderPages }) {
  const copy = placeholderPages[page];
  return (
    <div className="landing min-h-dvh">
      <header>
        <Container className="flex h-16 items-center">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            {brand.name}
          </Link>
        </Container>
      </header>
      <main>
        <Container className="max-w-2xl py-20">
          <h1 className="text-4xl">{copy.title}</h1>
          <p className="mt-6 text-lg leading-relaxed text-(--lp-ink-soft)">{copy.body}</p>
          <p className="mt-8">
            <Link to="/" className="underline underline-offset-4">
              Back to the home page
            </Link>
          </p>
        </Container>
      </main>
    </div>
  );
}
