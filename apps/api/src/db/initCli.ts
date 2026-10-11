import { connectMongo } from "./client.ts";
import { initDb } from "./init.ts";

const { client, db } = await connectMongo();
try {
  await initDb(db, (s) => console.log(s));
} finally {
  await client.close();
}
