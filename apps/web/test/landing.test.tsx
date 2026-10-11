// @vitest-environment jsdom
import { Flowchart } from "@/routes/landing/components/Flowchart";
import { ContactForm } from "@/routes/landing/components/ContactForm";
import { LogoWall } from "@/routes/landing/components/LogoWall";
import { Testimonials } from "@/routes/landing/components/Testimonials";
import * as copy from "@/routes/landing/copy";
import { Landing } from "@/routes/landing/Landing";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLanding() {
  const router = createMemoryRouter([{ path: "/", element: <Landing /> }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("landing page sections", () => {
  it("has exactly one h1 and every section heading", async () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const title of [
      copy.hero.title,
      copy.whatMatters.title,
      copy.howItWorks.title,
      copy.whoItsFor.title,
      copy.examples.title,
      copy.principles.title,
      copy.faq.title,
      copy.contact.title,
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(await screen.findByRole("form", { name: "Contact form" })).toBeTruthy();
  });

  it("renders each section's copy", () => {
    const { container } = renderLanding();
    const text = container.textContent ?? "";
    for (const s of [
      copy.hero.subtitle,
      ...copy.whatMatters.cards.map((c) => c.body),
      ...copy.howItWorks.steps.flatMap((s) => [s.title, s.body, s.decides]),
      ...copy.whoItsFor.tiles.flatMap((t) => [t.title, t.body, t.fits]),
      copy.examples.note,
      ...copy.principles.items.flatMap((p) => [p.title, p.body]),
      ...copy.faq.items.map((f) => f.q),
      copy.brand.footerLine,
    ]) {
      expect(text).toContain(s);
    }
  });

  it("has header, main, and footer landmarks", () => {
    renderLanding();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("selects a how-it-works step and shows its recording slot", () => {
    renderLanding();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    fireEvent.click(tabs[2]!);
    expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getByText(copy.howItWorks.steps[2].recording.label)).toBeTruthy();
  });
});

describe("copy rules", () => {
  it("contains no banned words or percentage claims", () => {
    const { container } = renderLanding();
    for (const h of container.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      expect(h.textContent ?? "").not.toMatch(/AI-powered/i);
    }
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/revolution/i);
    expect(text).not.toMatch(/\bproven\b/i);
    expect(text).not.toMatch(/guarantee/i);
    expect(text).not.toMatch(/game-changing/i);
    // Any percentage at all is out: the page makes no numeric outcome claims.
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(%|percent)/i);
  });

  it("also checks copy that is not rendered until opened (FAQ answers)", () => {
    const all = JSON.stringify(copy);
    expect(all).not.toMatch(/AI-powered|revolution|\bproven\b|guarantee|\d+(\.\d+)?\s?(%|percent)/i);
  });
});

describe("Testimonials", () => {
  it("renders nothing with an empty array", () => {
    const { container } = render(<Testimonials items={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a named testimonial when one is provided", () => {
    render(<Testimonials items={[{ quote: "Synthetic quote.", name: "Test Person", role: "Coordinator", organization: "Example Org" }]} />);
    expect(screen.getByText(/Synthetic quote/)).toBeTruthy();
  });
});

describe("LogoWall", () => {
  it("renders placeholders when the logos array is empty", () => {
    render(<LogoWall logos={[]} placeholderCount={4} placeholderLabel="Your organization here" />);
    expect(screen.getAllByTestId("logo-placeholder")).toHaveLength(4);
    expect(screen.getAllByText("Your organization here")).toHaveLength(4);
  });

  it("renders real logos instead of placeholders when given", () => {
    render(<LogoWall logos={[{ name: "Example Org", src: "/logos/example.svg" }]} placeholderLabel="x" />);
    expect(screen.queryAllByTestId("logo-placeholder")).toHaveLength(0);
    expect(screen.getByAltText("Example Org")).toBeTruthy();
  });

  it("placeholders are keyboard focusable so focus shows the hover state", () => {
    render(<LogoWall placeholderLabel="x" />);
    for (const el of screen.getAllByTestId("logo-placeholder")) expect(el.getAttribute("tabindex")).toBe("0");
  });
});

describe("ContactForm", () => {
  it("shows inline errors for required fields and does not submit", async () => {
    const submit = vi.fn(async () => "ok");
    render(<ContactForm submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: copy.contact.submit }));
    expect(submit).not.toHaveBeenCalled();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Please add your name.")).toBeTruthy();
    expect(screen.getByText("Pick a team size.")).toBeTruthy();
    expect(screen.getByLabelText(copy.contact.fields.name).getAttribute("aria-invalid")).toBe("true");
  });
});

describe("reduced motion", () => {
  const steps = copy.howItWorks.steps;
  const props = { steps, active: 0, onSelect: () => {}, autoMs: 7000, label: "steps" };

  it("flowchart turns off auto-advance when reduced motion is on", () => {
    mockReducedMotion(true);
    const { container } = render(<Flowchart {...props} />);
    expect(screen.getByTestId("flowchart").getAttribute("data-reduced-motion")).toBe("true");
    expect(container.querySelector(".lp-progress")).toBeNull();
  });

  it("flowchart shows the auto-advance progress when motion is allowed", () => {
    mockReducedMotion(false);
    const { container } = render(<Flowchart {...props} />);
    expect(screen.getByTestId("flowchart").getAttribute("data-reduced-motion")).toBe("false");
    expect(container.querySelector(".lp-progress")).not.toBeNull();
  });

  it("every animated edge class is disabled by the reduced-motion stylesheet", () => {
    // Vitest stubs CSS imports, so read the file; tests run from the repo root.
    const css = readFileSync("apps/web/src/routes/landing/landing.css", "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of [".lp-edge > i", ".lp-svg-beam", ".lp-ripple > span", ".lp-lift:hover"]) expect(reduced).toContain(cls);
  });
});
