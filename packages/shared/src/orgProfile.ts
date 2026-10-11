/**
 * Organization profile (onboarding step 2) and rubric weights (onboarding step 4).
 * Every profile field is optional: a coordinator can skip the step and fill it in later.
 */
import { z } from "zod";

export const NonprofitStatus = z.enum(["registered_nonprofit", "community_group", "other", "prefer_not_to_say"]);
export type NonprofitStatus = z.infer<typeof NonprofitStatus>;

export const RevenueBand = z.enum(["under_100k", "100k_to_1m", "1m_to_10m", "over_10m", "prefer_not_to_say"]);
export type RevenueBand = z.infer<typeof RevenueBand>;

export const StaffSizeBand = z.enum(["volunteers_only", "1_to_10", "11_to_50", "over_50", "prefer_not_to_say"]);
export type StaffSizeBand = z.infer<typeof StaffSizeBand>;

/** Plain-language labels for the onboarding form. Keys match the enums above. */
export const ORG_PROFILE_LABELS = {
  nonprofitStatus: {
    registered_nonprofit: "Registered nonprofit or charity",
    community_group: "Community group, not registered",
    other: "Something else",
    prefer_not_to_say: "Prefer not to say",
  },
  revenueBand: {
    under_100k: "Under $100,000 a year",
    "100k_to_1m": "$100,000 to $1 million a year",
    "1m_to_10m": "$1 million to $10 million a year",
    over_10m: "Over $10 million a year",
    prefer_not_to_say: "Prefer not to say",
  },
  staffSize: {
    volunteers_only: "Volunteers only",
    "1_to_10": "1 to 10 staff",
    "11_to_50": "11 to 50 staff",
    over_50: "Over 50 staff",
    prefer_not_to_say: "Prefer not to say",
  },
} as const satisfies Record<string, Record<string, string>>;

const shortText = (max: number) => z.string().trim().max(max);

export const OrgProfile = z.object({
  nonprofit_status: NonprofitStatus.nullable(),
  annual_revenue_band: RevenueBand.nullable(),
  staff_size_band: StaffSizeBand.nullable(),
  mission: shortText(300).nullable(),
  country: shortText(80).nullable(),
});
export type OrgProfile = z.infer<typeof OrgProfile>;

export const OrgProfileUpdate = z.strictObject({
  nonprofit_status: NonprofitStatus.nullable().optional(),
  annual_revenue_band: RevenueBand.nullable().optional(),
  staff_size_band: StaffSizeBand.nullable().optional(),
  mission: shortText(300).nullable().optional(),
  country: shortText(80).nullable().optional(),
});
export type OrgProfileUpdate = z.infer<typeof OrgProfileUpdate>;

/** How much a rubric item counts in a call evaluation. 0 switches the item off. Missing means 1. */
export const RubricWeight = z.number().int().min(0).max(5);
export const DEFAULT_RUBRIC_WEIGHT = 1;
