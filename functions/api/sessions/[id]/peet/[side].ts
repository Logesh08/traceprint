import {
  authorize,
  expired,
  json,
  routeParam,
  sessionRow,
  sideParam,
  type TraceContext
} from "../../../../_shared/server";

function parsePeetJson(input: string) {
  if (!input.trim()) throw new Error("Paste a tls.peet.ws JSON response first.");
  if (input.length > 750_000) throw new Error("The JSON is too large (750 KB maximum).");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The Peet response must be a JSON object.");
  }
  const object = parsed as Record<string, unknown>;
  if (
    !("tls" in object) &&
    !("http2" in object) &&
    !("http_version" in object) &&
    !("user_agent" in object)
  ) {
    throw new Error("This does not resemble a tls.peet.ws /api/all response.");
  }
  return object;
}

export const onRequestPut: PagesFunction = async (rawContext) => {
  const context = rawContext as TraceContext;
  try {
    const id = routeParam(context, "id");
    const side = sideParam(context);
    if (!side) return json({ error: "Side must be a or b." }, 400);
    const session = await sessionRow(context.env.DB, id);
    if (!session) return json({ error: "Session not found." }, 404);
    if (expired(session)) return json({ error: "This session has expired." }, 410);
    if (!(await authorize(context.request, session, "owner"))) {
      return json({ error: "The owner token is missing or invalid." }, 401);
    }
    const body = (await context.request.json()) as { json?: string };
    const peet = parsePeetJson(body.json ?? "");
    const capturedAt = new Date().toISOString();
    await context.env.DB
      .prepare(
        "UPDATE captures SET peet_json = ?, peet_captured_at = ? WHERE session_id = ? AND side = ?"
      )
      .bind(JSON.stringify(peet), capturedAt, id, side)
      .run();
    return json({ ok: true, capturedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Peet JSON.";
    const status = /JSON|Peet|large|Paste|resemble/.test(message) ? 400 : 500;
    if (status === 500) console.error("capture.peet", error);
    return json({ error: message }, status);
  }
};
