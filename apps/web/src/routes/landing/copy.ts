/**
 * All landing-page copy in one place (Prompt L1). Edit words here, not in the sections.
 *
 * Copy rules (enforced by apps/web/test/landing.test.tsx): plain sentences, no superlatives,
 * no retention or revenue claims, never "proven" or "guaranteed", no "AI-powered" in headings,
 * category names instead of real organizations.
 *
 * Screen recordings: drop files in apps/web/public/recordings/ and set `src` (and optionally
 * `poster`) below. Until then each slot shows a quiet placeholder at the same size.
 */

export type Recording = {
  /** e.g. "/recordings/hero.mp4". null shows the placeholder. */
  src: string | null;
  poster?: string;
  /** Read by screen readers and shown as the placeholder caption. */
  label: string;
};

export const brand = {
  name: "CallCoach",
  footerLine: "Built with and for volunteer teams.",
};

export const nav = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#who-its-for", label: "Who it's for" },
  { href: "#principles", label: "Principles" },
  { href: "#faq", label: "FAQ" },
];

export const hero = {
  eyebrow: "For volunteer calling teams",
  title: "Keep your calling team's memory and follow-through in one calm place.",
  /** Phrase in the title shown on a soft highlighter. */
  highlight: "one calm place",
  subtitle: "Plan the calls, prepare each caller, and follow up, with a person approving every step.",
  primaryCta: "See how it works",
  secondaryCta: "Talk with us",
  recording: {
    src: null,
    label: "A two-minute walkthrough of a coordinator's week",
  } satisfies Recording,
};

export const whatMatters = {
  eyebrow: "What matters",
  title: "Built around the people doing the calling.",
  cards: [
    {
      icon: "people",
      title: "Your people stay in charge.",
      body: "A coordinator approves every decision. The tool drafts; people decide.",
    },
    {
      icon: "shield",
      title: "Donor information stays under control.",
      body: "Notes are checked on the caller's device before anything is stored, and you see exactly what was kept and what was sent.",
    },
    {
      icon: "book",
      title: "Knowledge survives turnover.",
      body: "Approved guidance, handoff notes, and open follow-ups carry over when a coordinator changes.",
    },
  ],
} as const;

export const howItWorks = {
  eyebrow: "How it works",
  title: "Four steps, and a person decides at each one.",
  steps: [
    {
      key: "plan",
      title: "Plan",
      body: "Build this week's call list with a reason next to each donor.",
      decides: "The coordinator picks who gets a call.",
      recording: { src: null, label: "Building a call list" } satisfies Recording,
    },
    {
      key: "prepare",
      title: "Prepare",
      body: "Each caller gets a short, approved brief with any open follow-ups.",
      decides: "The coordinator approves what goes in the brief.",
      recording: { src: null, label: "A caller's brief before the call" } satisfies Recording,
    },
    {
      key: "record",
      title: "Record",
      body: "The caller's short note is checked on their device, then turned into a draft log.",
      decides: "The caller approves the log before it is sent.",
      recording: { src: null, label: "Checking and approving a call note" } satisfies Recording,
    },
    {
      key: "follow",
      title: "Follow through",
      body: "Follow-ups get an owner and a due date. Anything overdue shows up for the coordinator.",
      decides: "The coordinator decides what happens next.",
      recording: { src: null, label: "Follow-ups and what's overdue" } satisfies Recording,
    },
  ],
} as const;

export const whoItsFor = {
  eyebrow: "Who it's for",
  title: "Teams where people come and go, but donors shouldn't notice.",
  tiles: [
    {
      icon: "student",
      title: "Student calling teams",
      body: "Callers reach donors across time zones from a central office.",
      fits: "Fits when shifts are short and callers change each term.",
    },
    {
      icon: "campus",
      title: "THON and campus committees",
      body: "Leadership rotates every year, and so does the know-how.",
      fits: "Fits when a new chair inherits last year's relationships.",
    },
    {
      icon: "church",
      title: "Churches and congregations",
      body: "Many volunteers make calls while staff changes over time.",
      fits: "Fits when members call members and care matters most.",
    },
    {
      icon: "soup",
      title: "Food and community programs",
      body: "Volunteer turnover is high and every supporter counts.",
      fits: "Fits when a small staff relies on a changing crew.",
    },
  ],
} as const;

export const examples = {
  eyebrow: "Early program",
  title: "Teams in the early program",
  placeholderLabel: "Your organization here",
  placeholderCount: 4,
  note: "Trusted by teams in the early program. Names shared with permission.",
};

export const testimonials = {
  eyebrow: "In their words",
  title: "What teams tell us",
};

export const principles = {
  eyebrow: "Principles",
  title: "What we hold ourselves to.",
  items: [
    {
      title: "Humans decide.",
      body: "Nothing changes in a donor record without a person approving it.",
    },
    {
      title: "Notes are checked before they leave.",
      body: "Phone numbers, emails, street addresses, and names already on file are removed on the caller's device first, and the result is shown to the caller.",
    },
    {
      title: "No ranking of people.",
      body: "Teams see patterns and trends, never leaderboards.",
    },
    {
      title: "Honest claims.",
      body: "We don't promise revenue lifts. We count calls made, follow-ups completed, and what coordinators tell us.",
    },
  ],
};

export const faq = {
  eyebrow: "FAQ",
  title: "Questions coordinators ask.",
  items: [
    {
      q: "Does it call donors for us?",
      a: "No. A person always makes the call. CallCoach helps before and after it.",
    },
    {
      q: "Does it replace our CRM?",
      a: "No. It works alongside whatever you use now and writes an approved note back only when you choose to.",
    },
    {
      q: "Where does donor data go?",
      a: "A caller's notes are checked on their own device first. Only the fields the caller approves are sent to our server and stored, and a ledger shows exactly what was sent.",
      link: { href: "#principles", label: "Read our principles" },
    },
    {
      q: "Does it use AI?",
      a: "Yes, in a few limited places. A language model reads the approved note and suggests follow-up flags, and it drafts short text fields. A coordinator reviews every suggestion. It never contacts donors and never edits a record on its own.",
    },
    {
      q: "What does it cost?",
      a: "Pricing is shown when we launch. Pilots are free while we learn together.",
    },
    {
      q: "Can volunteers see everything?",
      a: "No. Volunteers see their own teams and the donors they're assigned to.",
    },
  ],
};

export const contact = {
  eyebrow: "Talk with us",
  title: "Tell us about your team.",
  body: "We're working with a small number of teams during the pilot. A person on our side reads every message.",
  fields: {
    name: "Your name",
    email: "Email",
    organization: "Organization",
    role: "Your role",
    rolePlaceholder: "Coordinator, staff lead, chair…",
    teamSize: "Calling team size",
    teamSizePlaceholder: "Choose a size",
    message: "Anything we should know?",
    messageOptional: "Optional",
  },
  teamSizes: [
    { value: "1-5", label: "1 to 5 people" },
    { value: "6-15", label: "6 to 15 people" },
    { value: "16-50", label: "16 to 50 people" },
    { value: "51+", label: "More than 50" },
  ],
  submit: "Send message",
  sending: "Sending…",
  successTitle: "Thanks, we got it.",
  error: "Something went wrong sending that. Please try again in a moment.",
};

export const footer = {
  links: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/sign-in", label: "Sign in" },
  ],
};

export const placeholderPages = {
  privacy: { title: "Privacy", body: "Our privacy notice is being written. Until then, the principles on the home page describe how we handle data." },
  terms: { title: "Terms", body: "Our terms of service are being written and will appear here before launch." },
};

/** The animated "what leaves the device" diagram beside the principles. */
export const privacyFlow = {
  label: "How a call note travels",
  device: "On the caller's device",
  boundary: "Only the approved note crosses this line",
  server: "On our server",
  deviceSteps: [
    { title: "Caller writes a short note", body: "Typed right after the call." },
    { title: "Identifiers are removed", body: "Known names, phones, emails, and addresses." },
    { title: "Caller approves what's sent", body: "A ledger shows every field." },
  ],
  serverSteps: [
    { title: "Approved note is stored", body: "Never the full note." },
    { title: "Coordinator decides", body: "Suggested flags are only suggestions." },
  ],
};
