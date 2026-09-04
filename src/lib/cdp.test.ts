import { describe, expect, it } from "vitest";
import { detectCdpRuntime } from "./cdp";

describe("detectCdpRuntime", () => {
  it("ignores Error.name getter accesses that also happen without CDP", () => {
    const result = detectCdpRuntime([
      { stackAccesses: 0, nameAccesses: 1 },
      { stackAccesses: 0, nameAccesses: 1 },
      { stackAccesses: 0, nameAccesses: 1 },
      { stackAccesses: 0, nameAccesses: 1 }
    ]);

    expect(result.detected).toBe(false);
    expect(result.nameAccesses).toBe(4);
    expect(result.stackAccesses).toBe(0);
  });

  it("detects the stack serialization pattern from the CDP capture", () => {
    const result = detectCdpRuntime([
      { stackAccesses: 1, nameAccesses: 1 },
      { stackAccesses: 1, nameAccesses: 1 },
      { stackAccesses: 1, nameAccesses: 1 },
      { stackAccesses: 1, nameAccesses: 1 }
    ]);

    expect(result.detected).toBe(true);
    expect(result.stackAccesses).toBe(4);
  });

  it("supports the post-patch prototype-chain serialization signal", () => {
    const result = detectCdpRuntime(
      [{ stackAccesses: 0, nameAccesses: 0 }],
      [{ ownKeysAccesses: 1 }]
    );

    expect(result.detected).toBe(true);
    expect(result.prototypeOwnKeysAccesses).toBe(1);
  });
});
