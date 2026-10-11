import { readFileSync } from "node:fs";
import { DonorFile } from "@sc/shared";
import { createDb } from "./client.ts";
import { donors, gifts } from "./schema.ts";

const donor = DonorFile.parse(JSON.parse(readFileSync(new URL("../../../../data/donor.json", import.meta.url), "utf8")));
const { db, pool } = createDb();
try {
  const { id, ...rest } = donor;
  const row = { id, ...rest, spouse_name: rest.spouse_name ?? null, employer: rest.employer ?? null, town: rest.town ?? null };
  await db.insert(donors).values(row).onConflictDoUpdate({ target: donors.id, set: rest });
  await db
    .insert(gifts)
    .values({ id: `g-${id}-1`, donor_id: id, amount_band: donor.last_gift_band, campaign: donor.campaign, gift_date: "2026-04-18T00:00:00Z" })
    .onConflictDoNothing();
  console.log(`seeded donor ${id} and 1 gift`);
} finally {
  await pool.end();
}
