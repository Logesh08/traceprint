import {
  ensureSchema,
  hashToken,
  json,
  randomToken,
  type TraceContext
} from "../../_shared/server";

export const onRequestPost: PagesFunction = async (rawContext) => {
  const context = rawContext as TraceContext;
  try {
    await ensureSchema(context.env.DB);
    const id = crypto.randomUUID();
    const ownerToken = randomToken();
    const sideTokens = { a: randomToken(), b: randomToken() };
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [ownerHash, aHash, bHash] = await Promise.all([
      hashToken(ownerToken),
      hashToken(sideTokens.a),
      hashToken(sideTokens.b)
    ]);

    await context.env.DB.batch([
      context.env.DB
        .prepare(
          "INSERT INTO sessions (id, owner_token_hash, a_token_hash, b_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(id, ownerHash, aHash, bHash, createdAt, expiresAt),
      context.env.DB
        .prepare("INSERT INTO captures (session_id, side) VALUES (?, 'a')")
        .bind(id),
      context.env.DB
        .prepare("INSERT INTO captures (session_id, side) VALUES (?, 'b')")
        .bind(id),
      context.env.DB
        .prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .bind(createdAt)
    ]);

    return json({ id, ownerToken, sideTokens, createdAt, expiresAt }, 201);
  } catch (error) {
    console.error("session.create", error);
    return json({ error: "Could not create a comparison session." }, 500);
  }
};
