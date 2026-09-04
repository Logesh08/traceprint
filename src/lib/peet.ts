type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(source: JsonObject | undefined, keys: string[]) {
  if (!source) return {};
  return Object.fromEntries(
    keys.filter((key) => key in source).map((key) => [key, source[key]])
  );
}

export function parsePeetJson(input: string): JsonObject {
  if (!input.trim()) throw new Error("Paste a tls.peet.ws JSON response first.");
  if (input.length > 750_000) throw new Error("The JSON is too large (750 KB maximum).");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  if (!isObject(parsed)) throw new Error("The Peet response must be a JSON object.");
  const resemblesPeet =
    "tls" in parsed ||
    "http2" in parsed ||
    "http_version" in parsed ||
    "user_agent" in parsed;
  if (!resemblesPeet) {
    throw new Error("This does not resemble a tls.peet.ws /api/all response.");
  }
  return parsed;
}

export function normalizePeet(raw: JsonObject | null) {
  if (!raw) return null;
  const tls = isObject(raw.tls) ? raw.tls : undefined;
  const http2 = isObject(raw.http2) ? raw.http2 : undefined;
  return {
    request: pick(raw, ["ip", "http_version", "method", "user_agent"]),
    tls: pick(tls, [
      "tls_version_record",
      "tls_version_negotiated",
      "ja3",
      "ja3_hash",
      "ja4",
      "ja4_r",
      "peetprint",
      "peetprint_hash",
      "ciphers",
      "extensions"
    ]),
    http2: pick(http2, [
      "akamai_fingerprint",
      "akamai_fingerprint_hash",
      "sent_frames"
    ])
  };
}
