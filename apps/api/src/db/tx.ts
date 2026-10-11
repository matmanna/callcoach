import type { ClientSession, MongoClient } from "mongodb";

/** Runs fn in a transaction (replica set required, which docker-compose and Atlas provide). */
export async function withTx<T>(client: MongoClient, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}
