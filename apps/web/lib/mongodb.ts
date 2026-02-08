import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI?.trim() ?? "";
const dbName = process.env.MONGODB_DB?.trim();

if (!uri) {
  throw new Error(
    "MONGODB_URI is not set. Set it in apps/web/.env.local (copy the connection string from MongoDB Atlas)."
  );
}

if (!dbName) {
  throw new Error("MONGODB_DB is not set. Add it to apps/web/.env.local.");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// For a mongodb+srv:// Atlas URI, the Node driver configures TLS itself.
// Force IPv4 (family: 4) to avoid Node 17+ IPv6 TLS handshake issues with Atlas.
const clientOptions: { family?: 4 } = { family: 4 };

const clientPromise =
  global._mongoClientPromise ??
  (() => {
    const client = new MongoClient(uri, clientOptions);
    return client.connect();
  })();

global._mongoClientPromise = clientPromise;

export async function getDb() {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}

export { ObjectId };
