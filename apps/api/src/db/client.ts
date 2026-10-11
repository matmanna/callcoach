import { MongoClient, type Db } from "mongodb";

export interface Mongo {
  client: MongoClient;
  db: Db;
}

export function mongoUri(env: NodeJS.ProcessEnv = process.env): string {
  const uri = env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");
  return uri;
}

/** Connects and returns the client plus the database named in the URI (default "stewardship"). */
export async function connectMongo(uri = mongoUri(), dbName?: string): Promise<Mongo> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: Number(process.env.MONGO_MAX_POOL ?? 10) || 10 });
  await client.connect();
  return { client, db: client.db(dbName) };
}
