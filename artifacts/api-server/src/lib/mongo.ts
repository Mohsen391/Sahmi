import mongoose from "mongoose";

type MongoCache = {
  connection: typeof mongoose | null;
  pending: Promise<typeof mongoose> | null;
};

const shared = globalThis as typeof globalThis & { sahmiMongo?: MongoCache };
const cache = (shared.sahmiMongo ??= { connection: null, pending: null });

/** One cached connection/promise, also reusable by serverless invocations. */
export async function connectMongo(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  if (cache.connection && mongoose.connection.readyState === 1) {
    return cache.connection;
  }
  if (!cache.pending) {
    cache.pending = mongoose.connect(uri, {
      dbName: "sahmi",
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10_000,
      bufferCommands: false,
    });
  }
  try {
    cache.connection = await cache.pending;
    return cache.connection;
  } catch (error) {
    cache.connection = null;
    const details = error as { name?: string; code?: unknown; message?: string };
    const authFailure = details.code === 18 || /authentication failed|bad auth/i.test(details.message ?? "");
    const reason = authFailure ? "authentication failed"
      : details.name === "MongoParseError" ? "connection string format is invalid"
      : details.name === "MongooseServerSelectionError" ? "server unavailable; check Atlas network access"
      : "connection unavailable";
    throw new Error(`MongoDB ${reason}`);
  } finally {
    cache.pending = null;
  }
}
