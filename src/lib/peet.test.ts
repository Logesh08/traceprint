import { describe, expect, it } from "vitest";
import { normalizePeet, parsePeetJson } from "./peet";

describe("Peet adapter", () => {
  it("validates and normalizes a transport report", () => {
    const raw = parsePeetJson(
      JSON.stringify({
        ip: "203.0.113.10",
        http_version: "h2",
        user_agent: "Example",
        tls: { ja3_hash: "abc", ja4: "t13d", ignored: true },
        http2: { akamai_fingerprint: "1:2;3", ignored: true }
      })
    );
    const normalized = normalizePeet(raw);
    expect(normalized?.request.http_version).toBe("h2");
    expect(normalized?.tls.ja3_hash).toBe("abc");
    expect(normalized?.http2.akamai_fingerprint).toBe("1:2;3");
    expect(normalized?.tls).not.toHaveProperty("ignored");
  });

  it("rejects unrelated JSON", () => {
    expect(() => parsePeetJson('{"hello":"world"}')).toThrow(/resemble/);
  });
});
