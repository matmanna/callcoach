/**
 * Synthetic sample data seeded into every new organization (and by `pnpm db:seed`).
 * Synthetic only: no real donor, volunteer, or nonprofit data. Bundled as TypeScript constants
 * because the Lambda bundle cannot read files from disk. A test keeps this equal to data/seed/*.
 */
export const SAMPLE_CAMPAIGN = "Spring Youth Appeal 2026";

export const SAMPLE_TEAMS = [
  { name: "Student Callers", focus: "student calling, local donors" },
  { name: "Alumni Callers", focus: "alumni calling, long-time donors" },
] as const;

/** Columns match data/seed/donors.csv. */
export const SAMPLE_DONORS: ReadonlyArray<Record<string, string>> = [
  {
    "external_id": "d-102",
    "first_name": "Rosalind",
    "last_name": "Featherstone",
    "spouse_name": "Walter",
    "employer": "Larkspur Valley Hospital",
    "town": "Millbrook",
    "region": "US-PA",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$100-$249",
    "past_gift_count": "7",
    "last_gift_band": "$100-$249",
    "limits": "No phone calls during tax season (February to April)",
    "team_name": "Student Callers"
  },
  {
    "external_id": "d-201",
    "first_name": "Harriet",
    "last_name": "Penwarden",
    "spouse_name": "Clement",
    "employer": "Stonebridge Library",
    "town": "Kestrel Falls",
    "region": "US-PA",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$50-$99",
    "past_gift_count": "4",
    "last_gift_band": "$50-$99",
    "limits": "",
    "team_name": "Student Callers"
  },
  {
    "external_id": "d-202",
    "first_name": "Desmond",
    "last_name": "Arkwright",
    "spouse_name": "Lorna",
    "employer": "Halvorsen Freight",
    "town": "Pell Harbor",
    "region": "US-OH",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$250-$499",
    "past_gift_count": "9",
    "last_gift_band": "$250-$499",
    "limits": "Mail only",
    "team_name": "Student Callers"
  },
  {
    "external_id": "d-203",
    "first_name": "Imogen",
    "last_name": "Thackeray",
    "spouse_name": "Rafael",
    "employer": "Corrigan and Webb",
    "town": "Ashby Cross",
    "region": "US-NH",
    "campaign": "Spring Gala 2026",
    "gift_band": "$500-$999",
    "past_gift_count": "3",
    "last_gift_band": "$250-$499",
    "limits": "",
    "team_name": "Student Callers"
  },
  {
    "external_id": "d-204",
    "first_name": "Beatrice",
    "last_name": "Kowalczyk",
    "spouse_name": "Henryk",
    "employer": "Fernhill Elementary",
    "town": "Larchmont Mills",
    "region": "US-MI",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$100-$249",
    "past_gift_count": "12",
    "last_gift_band": "$100-$249",
    "limits": "",
    "team_name": "Student Callers"
  },
  {
    "external_id": "d-205",
    "first_name": "Clarence",
    "last_name": "Obuya",
    "spouse_name": "",
    "employer": "Dunmore Rail Yard",
    "town": "Wexley",
    "region": "US-PA",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$100-$249",
    "past_gift_count": "2",
    "last_gift_band": "$50-$99",
    "limits": "",
    "team_name": "Alumni Callers"
  },
  {
    "external_id": "d-206",
    "first_name": "Winifred",
    "last_name": "Ashdown",
    "spouse_name": "Gerald",
    "employer": "Marlow Textile Company",
    "town": "Brannock",
    "region": "CA-ON",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$100-$249",
    "past_gift_count": "6",
    "last_gift_band": "$100-$249",
    "limits": "Email only;No calls after 6pm",
    "team_name": "Alumni Callers"
  },
  {
    "external_id": "d-207",
    "first_name": "Agnes",
    "last_name": "Merriweather",
    "spouse_name": "Frank",
    "employer": "Tollgate Veterinary Clinic",
    "town": "Hollis Bend",
    "region": "US-OH",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$50-$99",
    "past_gift_count": "1",
    "last_gift_band": "$50-$99",
    "limits": "",
    "team_name": "Alumni Callers"
  },
  {
    "external_id": "d-208",
    "first_name": "Maureen",
    "last_name": "Talbot",
    "spouse_name": "",
    "employer": "Riverside Credit Union",
    "town": "Ellery Point",
    "region": "US-MI",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$100-$249",
    "past_gift_count": "15",
    "last_gift_band": "$100-$249",
    "limits": "",
    "team_name": "Alumni Callers"
  },
  {
    "external_id": "d-209",
    "first_name": "Odessa",
    "last_name": "Pemberton",
    "spouse_name": "Lionel",
    "employer": "Quayside Dental",
    "town": "Fallowmere",
    "region": "GB-ENG",
    "campaign": "Spring Youth Appeal 2026",
    "gift_band": "$250-$499",
    "past_gift_count": "5",
    "last_gift_band": "$250-$499",
    "limits": "No home phone calls",
    "team_name": "Alumni Callers"
  }
];

/** Columns match data/seed/gifts.csv. */
export const SAMPLE_GIFTS: ReadonlyArray<Record<string, string>> = [
  {
    "external_id": "g-1001",
    "donor_external_id": "d-102",
    "amount_band": "$100-$249",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-18"
  },
  {
    "external_id": "g-1002",
    "donor_external_id": "d-201",
    "amount_band": "$50-$99",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-02"
  },
  {
    "external_id": "g-1003",
    "donor_external_id": "d-202",
    "amount_band": "$250-$499",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-03-27"
  },
  {
    "external_id": "g-1004",
    "donor_external_id": "d-203",
    "amount_band": "$500-$999",
    "campaign": "Spring Gala 2026",
    "gift_date": "2026-05-09"
  },
  {
    "external_id": "g-1005",
    "donor_external_id": "d-204",
    "amount_band": "$100-$249",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-11"
  },
  {
    "external_id": "g-1006",
    "donor_external_id": "d-205",
    "amount_band": "$100-$249",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-21"
  },
  {
    "external_id": "g-1007",
    "donor_external_id": "d-206",
    "amount_band": "$100-$249",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-03-30"
  },
  {
    "external_id": "g-1008",
    "donor_external_id": "d-207",
    "amount_band": "$50-$99",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-05-02"
  },
  {
    "external_id": "g-1009",
    "donor_external_id": "d-208",
    "amount_band": "$100-$249",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-07"
  },
  {
    "external_id": "g-1010",
    "donor_external_id": "d-209",
    "amount_band": "$250-$499",
    "campaign": "Spring Youth Appeal 2026",
    "gift_date": "2026-04-25"
  }
];

export const SAMPLE_FACTS = [
  {
    "text": "The Brightpath youth program pairs students with trained adult mentors for weekly after-school sessions. 340 students took part in the 2025-26 school year, as reported by the program office.",
    "source": "Brightpath Youth Alliance program office, 2025-26 enrollment report",
    "verified_on": "2026-09-15"
  },
  {
    "text": "Gifts to the Spring Youth Appeal fund mentor training, session materials, and transport to sessions, as listed in the approved 2026 program budget.",
    "source": "Brightpath Youth Alliance 2026 program budget (board-approved)",
    "verified_on": "2026-09-15"
  },
  {
    "text": "The youth program runs a free two-week summer day camp. 85 students attended in summer 2026, as reported by the camp director.",
    "source": "Brightpath Youth Alliance summer camp report 2026",
    "verified_on": "2026-09-22"
  }
] as const;

export const SAMPLE_RUBRIC = {
  "items": [
    {
      "id": "thanked_by_name",
      "text": "Thanked the donor by name",
      "supporting_tags": []
    },
    {
      "id": "open_question",
      "text": "Asked one open question",
      "supporting_tags": [
        "PROGRAM_QUESTION"
      ]
    },
    {
      "id": "acknowledged_loss",
      "text": "Acknowledged a loss",
      "supporting_tags": [
        "FAMILY_DECEASED_RECENT"
      ],
      "conditional_on_tag": "FAMILY_DECEASED_RECENT"
    },
    {
      "id": "respected_limit",
      "text": "Respected a stated limit",
      "supporting_tags": [
        "STOP_CONTACT_REQUESTED",
        "EMAIL_PREFERRED"
      ]
    },
    {
      "id": "no_ask",
      "text": "Made no ask in this call",
      "supporting_tags": []
    },
    {
      "id": "next_step",
      "text": "Closed with a next step",
      "supporting_tags": [
        "FOLLOW_UP_REQUESTED",
        "EMAIL_PREFERRED"
      ]
    }
  ]
} as const;
