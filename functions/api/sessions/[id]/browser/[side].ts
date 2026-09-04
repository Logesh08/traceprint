import {
  authorize,
  expired,
  json,
  routeParam,
  selectedHeaders,
  sessionRow,
  sideParam,
  type TraceContext
} from "../../../../_shared/server";

export const onRequestPut: PagesFunction = async (rawContext) => {
  const context = rawContext as TraceContext;
  try {
    const id = routeParam(context, "id");
    const side = sideParam(context);
    if (!side) return json({ error: "Side must be a or b." }, 400);
    const session = await sessionRow(context.env.DB, id);
    if (!session) return json({ error: "Session not found." }, 404);
    if (expired(session)) return json({ error: "This session has expired." }, 410);
    if (!(await authorize(context.request, session, side))) {
      return json({ error: "The capture token is missing or invalid." }, 401);
    }

    const length = Number(context.request.headers.get("content-length") || 0);
    if (length > 500_000) return json({ error: "Capture exceeds 500 KB." }, 413);
    const capture = (await context.request.json()) as Record<string, unknown>;
    if (capture.schemaVersion !== 1 || typeof capture.capturedAt !== "string") {
      return json({ error: "Unsupported browser capture." }, 400);
    }
    capture.serverObserved = {
      headers: selectedHeaders(context.request),
      protocol: new URL(context.request.url).protocol.replace(":", ""),
      note:
        "The Cloudflare edge can normalize headers. Traceprint does not claim original header ordering here."
    };
    const encoded = JSON.stringify(capture);
    if (encoded.length > 500_000) return json({ error: "Capture exceeds 500 KB." }, 413);
    const capturedAt = new Date().toISOString();
    await context.env.DB
      .prepare(
        "UPDATE captures SET browser_json = ?, browser_captured_at = ? WHERE session_id = ? AND side = ?"
      )
      .bind(encoded, capturedAt, id, side)
      .run();
    return json({ ok: true, capturedAt });
  } catch (error) {
    console.error("capture.browser", error);
    return json({ error: "Could not save the browser capture." }, 500);
  }
};
