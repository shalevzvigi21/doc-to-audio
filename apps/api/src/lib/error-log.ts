import { connection } from "./redis.js";

const MAX_ENTRIES = 50;
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** Strip anything secret-looking before an error leaves the server in a report. */
export function redact(text: string): string {
  return text
    .replace(/(AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,})/g, "[gemini-key]")
    .replace(/eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+/g, "[token]")
    .replace(/Bearer\s+[0-9A-Za-z._-]+/gi, "Bearer [token]")
    .replace(/(x-goog-api-key|api[_-]?key)["'\s:=]+[0-9A-Za-z_-]{16,}/gi, "$1=[redacted]");
}

export interface LoggedError {
  at: string;
  context: string;
  message: string;
}

/** Remember a recent error for one user so they can attach it to a problem report. Never throws. */
export async function logUserError(userId: string, context: string, err: unknown): Promise<void> {
  try {
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const entry: LoggedError = { at: new Date().toISOString(), context, message: redact(raw).slice(0, 600) };
    const key = `errlog:${userId}`;
    await connection.lpush(key, JSON.stringify(entry));
    await connection.ltrim(key, 0, MAX_ENTRIES - 1);
    await connection.expire(key, TTL_SECONDS);
  } catch {
    /* diagnostics are best-effort */
  }
}

export async function readUserErrors(userId: string): Promise<LoggedError[]> {
  try {
    const rows = await connection.lrange(`errlog:${userId}`, 0, MAX_ENTRIES - 1);
    return rows.map((r) => JSON.parse(r) as LoggedError);
  } catch {
    return [];
  }
}
