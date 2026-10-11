import { PhraseRulesFile, type Donor, type DonorDoc, type LogFields } from "@sc/shared";
import { noteContext, scrubNote } from "@sc/rules";
import { readFileSync } from "node:fs";
import { HttpError } from "../http.ts";

const phraseRules = PhraseRulesFile.parse(JSON.parse(readFileSync(new URL("../../../../data/phrase-rules.json", import.meta.url), "utf8"))).rules;

function redactorDonor(donor: DonorDoc): Donor {
  return {
    id: donor._id,
    first_name: donor.first_name,
    last_name: donor.last_name,
    spouse_name: donor.spouse_name ?? undefined,
    employer: donor.employer ?? undefined,
    town: donor.town ?? undefined,
    campaign: donor.campaign,
    gift_band: donor.gift_band,
    past_gift_count: donor.past_gift_count,
    last_gift_band: donor.last_gift_band,
    limits: donor.limits,
  };
}

export function scrubForDonor(note: string, donor: DonorDoc, callerName: string) {
  return scrubNote(note, noteContext(redactorDonor(donor), callerName, phraseRules));
}

/** The response deliberately includes counts only, never submitted values. */
export function assertNoPii(fields: LogFields, donor: DonorDoc, callerName: string): void {
  const counts: Record<string, number> = {};
  let found = false;
  for (const value of [fields.donor_stated_reason, fields.follow_up.action]) {
    const result = scrubForDonor(value, donor, callerName);
    if (result.text !== value) {
      found = true;
      for (const [type, count] of Object.entries(result.counts)) counts[type] = (counts[type] ?? 0) + count;
    }
  }
  if (found) throw new HttpError(422, "pii_detected", { counts });
}

export function assertNoPiiText(value: string, donor: DonorDoc, callerName: string): void {
  const result = scrubForDonor(value, donor, callerName);
  if (result.text !== value) throw new HttpError(422, "pii_detected", { counts: result.counts });
}
