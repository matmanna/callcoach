import { Donor, FlagLabel, PlantedFile, RawTurn } from "@sc/shared";
import { z } from "zod";
import { readJson } from "./fixtures.ts";

// Minimal mirror of the lab excerpt shape (the lab owns the full schema in apps/web).
const LabExcerpt = z.object({
  id: z.string(),
  donor: Donor,
  volunteer_name: z.string(),
  turns: z.array(RawTurn),
  planted: PlantedFile.shape.values,
  expected_flags: z.array(FlagLabel),
});

export const excerpts = z.object({ excerpts: z.array(LabExcerpt) }).parse(readJson("lab/excerpts.json")).excerpts;
