import {
  authorize,
  expired,
  json,
  routeParam,
  safeJson,
  sessionRow,
  type Side,
  type TraceContext
} from "../../_shared/server";

interface CaptureRow {
  side: Side;
  browser_json: string | null;
  browser_captured_at: string | null;
  peet_json: string | null;
  peet_captured_at: string | null;
}

export const onRequestGet: PagesFunction = async (rawContext) => {
  const context = rawContext as TraceContext;
  try {
    const id = routeParam(context, "id");
    const session = await sessionRow(context.env.DB, id);
    if (!session) return json({ error: "Session not found." }, 404);
    if (expired(session)) return json({ error: "This session has expired." }, 410);
    if (!(await authorize(context.request, session, "owner"))) {
      return json({ error: "The owner token is missing or invalid." }, 401);
    }

    const result = await context.env.DB
      .prepare(
        "SELECT side, browser_json, browser_captured_at, peet_json, peet_captured_at FROM captures WHERE session_id = ? ORDER BY side"
      )
      .bind(id)
      .all<CaptureRow>();
    const empty = () => ({
      browser: null,
      browserCapturedAt: null,
      peet: null,
      peetCapturedAt: null
    });
    const captures: Record<Side, ReturnType<typeof empty>> = {
      a: empty(),
      b: empty()
    };
    result.results.forEach((row) => {
      if (row.side !== "a" && row.side !== "b") return;
      captures[row.side] = {
        browser: safeJson(row.browser_json),
        browserCapturedAt: row.browser_captured_at,
        peet: safeJson(row.peet_json),
        peetCapturedAt: row.peet_captured_at
      };
    });

    return json({
      id: session.id,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      captures
    });
  } catch (error) {
    console.error("session.get", error);
    return json({ error: "Could not load this comparison." }, 500);
  }
};

export const onRequestDelete: PagesFunction = async (rawContext) => {
  const context = rawContext as TraceContext;
  try {
    const id = routeParam(context, "id");
    const session = await sessionRow(context.env.DB, id);
    if (!session) return json({ error: "Session not found." }, 404);
    if (!(await authorize(context.request, session, "owner"))) {
      return json({ error: "The owner token is missing or invalid." }, 401);
    }
    await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch (error) {
    console.error("session.delete", error);
    return json({ error: "Could not delete this comparison." }, 500);
  }
};
