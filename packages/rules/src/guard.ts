import { findIdentifierMatches } from "./patterns.ts";

export interface IdentifierCounts {
  phone: number;
  email: number;
  address: number;
  dob: number;
}

/** Counts of regex-detectable identifiers. Never returns matched text. */
export function scanForIdentifiers(text: string): IdentifierCounts {
  const counts: IdentifierCounts = { phone: 0, email: 0, address: 0, dob: 0 };
  for (const m of findIdentifierMatches(text)) {
    if (m.type === "PHONE") counts.phone += 1;
    else if (m.type === "EMAIL") counts.email += 1;
    else if (m.type === "ADDRESS") counts.address += 1;
    else counts.dob += 1;
  }
  return counts;
}

export function hasIdentifiers(text: string): boolean {
  const c = scanForIdentifiers(text);
  return c.phone + c.email + c.address + c.dob > 0;
}
