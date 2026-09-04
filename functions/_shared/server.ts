export interface Env {
  DB: D1Database;
}

export type TraceContext = EventContext<Env, string, Record<string, unknown>>;
export type Side = "a" | "b";

let schemaPromise: Promise<unknown> | null = null;

export function ensureSchema(db: D1Database) {
  if (!schemaPromise) {
    schemaPromise = db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, owner_token_hash TEXT NOT NULL, a_token_hash TEXT NOT NULL, b_token_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS captures (session_id TEXT NOT NULL, side TEXT NOT NULL CHECK (side IN ('a', 'b')), browser_json TEXT, browser_captured_at TEXT, peet_json TEXT, peet_captured_at TEXT, PRIMARY KEY (session_id, side), FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE)"
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)"
      )
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

export function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function hashToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function routeParam(context: TraceContext, name: string) {
  const value = context.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export function sideParam(context: TraceContext): Side | null {
  const value = routeParam(context, "side");
  return value === "a" || value === "b" ? value : null;
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

export interface SessionRow {
  id: string;
  owner_token_hash: string;
  a_token_hash: string;
  b_token_hash: string;
  created_at: string;
  expires_at: string;
}

export async function sessionRow(db: D1Database, id: string) {
  return db
    .prepare(
      "SELECT id, owner_token_hash, a_token_hash, b_token_hash, created_at, expires_at FROM sessions WHERE id = ?"
    )
    .bind(id)
    .first<SessionRow>();
}

export async function authorize(
  request: Request,
  session: SessionRow,
  role: "owner" | Side
) {
  const token = bearer(request);
  if (!token) return false;
  const received = await hashToken(token);
  const expected =
    role === "owner"
      ? session.owner_token_hash
      : role === "a"
        ? session.a_token_hash
        : session.b_token_hash;
  return received === expected;
}

export function expired(session: SessionRow) {
  return Date.parse(session.expires_at) <= Date.now();
}

export function safeJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function selectedHeaders(request: Request) {
  const names = [
    "accept",
    "accept-encoding",
    "accept-language",
    "cache-control",
    "dnt",
    "priority",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "user-agent"
  ];
  return Object.fromEntries(
    names
      .map((name) => [name, request.headers.get(name)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null)
  );
}
