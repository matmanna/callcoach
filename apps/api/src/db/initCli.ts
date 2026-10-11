import { readFileSync } from "node:fs";
import { connectMongo } from "./client.ts";
import { initDb } from "./init.ts";

const { client, db } = await connectMongo();
try {
  await initDb(db, (s) => console.log(s));
  // Atlas Search indexes exist only on Atlas. Created once when ATLAS_SEARCH=1; skipped everywhere else.
  if (process.env.ATLAS_SEARCH === "1") {
    const def = JSON.parse(readFileSync(new URL("../../../../infra/atlas/search-index-facts.json", import.meta.url), "utf8")) as { name: string; definition: object };
    const facts = db.collection("fact_item_versions");
    const existing = await facts.listSearchIndexes().toArray();
    if (existing.some((i) => i.name === def.name)) console.log(`search index ${def.name} exists`);
    else {
      await facts.createSearchIndex({ name: def.name, definition: def.definition });
      console.log(`created search index ${def.name} (it builds in the background; Atlas shows status)`);
    }
  }
} finally {
  await client.close();
}
