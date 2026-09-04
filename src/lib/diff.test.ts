import { describe, expect, it } from "vitest";
import { diffObjects } from "./diff";

describe("diffObjects", () => {
  it("finds matching, changed and one-sided values", () => {
    const diff = diffObjects(
      { browser: { ua: "Chrome", version: 1 }, onlyA: true },
      { browser: { ua: "Chrome", version: 2 }, onlyB: true }
    );

    expect(diff.find((entry) => entry.path === "browser.ua")?.status).toBe("same");
    expect(diff.find((entry) => entry.path === "browser.version")?.status).toBe("changed");
    expect(diff.find((entry) => entry.path === "onlyA")?.status).toBe("only-a");
    expect(diff.find((entry) => entry.path === "onlyB")?.status).toBe("only-b");
  });

  it("compares object keys independently of insertion order", () => {
    const [entry] = diffObjects({ value: { a: 1, b: 2 } }, { value: { b: 2, a: 1 } });
    expect(entry.status).toBe("same");
  });
});
