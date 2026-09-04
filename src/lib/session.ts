import type {
  BrowserCapture,
  SessionPayload,
  SessionSecrets,
  Side
} from "./types";

function authorization(token: string) {
  return { Authorization: "Bearer " + token };
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "The request failed.");
  }
  return body;
}

export async function createSession(): Promise<SessionSecrets> {
  return responseJson<SessionSecrets>(
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" }
    })
  );
}

export async function loadSession(
  id: string,
  ownerToken: string
): Promise<SessionPayload> {
  return responseJson<SessionPayload>(
    await fetch("/api/sessions/" + encodeURIComponent(id), {
      headers: authorization(ownerToken),
      cache: "no-store"
    })
  );
}

export async function saveBrowserCapture(
  id: string,
  side: Side,
  token: string,
  capture: BrowserCapture
) {
  return responseJson<{ ok: true; capturedAt: string }>(
    await fetch(
      "/api/sessions/" +
        encodeURIComponent(id) +
        "/browser/" +
        encodeURIComponent(side),
      {
        method: "PUT",
        headers: {
          ...authorization(token),
          "content-type": "application/json"
        },
        body: JSON.stringify(capture)
      }
    )
  );
}

export async function savePeet(
  id: string,
  side: Side,
  ownerToken: string,
  json: string
) {
  return responseJson<{ ok: true; capturedAt: string }>(
    await fetch(
      "/api/sessions/" +
        encodeURIComponent(id) +
        "/peet/" +
        encodeURIComponent(side),
      {
        method: "PUT",
        headers: {
          ...authorization(ownerToken),
          "content-type": "application/json"
        },
        body: JSON.stringify({ json })
      }
    )
  );
}

export function sessionHash(secrets: SessionSecrets) {
  const params = new URLSearchParams({
    owner: secrets.ownerToken,
    a: secrets.sideTokens.a,
    b: secrets.sideTokens.b
  });
  return params.toString();
}

export function readSessionHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const owner = params.get("owner");
  const a = params.get("a");
  const b = params.get("b");
  return owner && a && b ? { owner, sideTokens: { a, b } } : null;
}

export function readCaptureToken() {
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
}
