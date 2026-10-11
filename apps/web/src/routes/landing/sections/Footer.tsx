import { Link } from "react-router";
import { Container } from "../components/SectionHeading.tsx";
import { brand, footer } from "../copy.ts";

export function Footer() {
  return (
    <footer className="pb-10">
      <Container>
        <div className="flex flex-col gap-6 border-t border-(--lp-line) pt-8 text-sm text-(--lp-ink-soft) sm:flex-row sm:items-center">
        <span className="font-semibold text-(--lp-ink)">{brand.name}</span>
        <span>{brand.footerLine}</span>
        <nav aria-label="Footer" className="sm:ml-auto">
          <ul className="flex gap-5">
            {footer.links.map((l) => (
              <li key={l.href}>
                <Link to={l.href} className="hover:text-(--lp-ink)">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        </div>
      </Container>
    </footer>
  );
}
