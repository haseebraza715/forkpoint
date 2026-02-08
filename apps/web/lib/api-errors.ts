/**
 * Format database/network errors for API responses.
 * In development, surfaces the raw message; in production, returns a safe message.
 */
export function formatDbError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback;
  const isDbError =
    raw.includes("Mongo") ||
    raw.includes("SSL") ||
    raw.includes("TLS") ||
    raw.includes("ECONNREFUSED") ||
    raw.includes("ETIMEDOUT");
  if (isDbError && process.env.NODE_ENV === "development") {
    return `${fallback} Database: ${raw}. Check MONGODB_URI and Atlas IP whitelist.`;
  }
  if (isDbError) {
    return "Database connection failed. Check your connection string and Atlas network access.";
  }
  return raw;
}
