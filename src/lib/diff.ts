import type {
  BrowserCapture,
  ConsistencyFinding,
  DiffEntry
} from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable));
  if (isPlainObject(value)) {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return JSON.stringify(value);
}

function categoryFor(path: string) {
  const root = path.split(".")[0];
  const labels: Record<string, string> = {
    browser: "Browser",
    screen: "Display",
    locale: "Locale",
    hardware: "Hardware",
    graphics: "Graphics",
    canvas: "Canvas",
    audio: "Audio",
    fonts: "Fonts",
    features: "Features",
    workers: "Workers",
    serverObserved: "Server HTTP",
    automation: "Automation / CDP",
    transport: "TLS / HTTP"
  };
  return labels[root] ?? "Other";
}

export function diffObjects(a: unknown, b: unknown, prefix = ""): DiffEntry[] {
  if (a === undefined && b === undefined) return [];
  if (isPlainObject(a) || isPlainObject(b)) {
    const objectA = isPlainObject(a) ? a : {};
    const objectB = isPlainObject(b) ? b : {};
    const keys = Array.from(
      new Set(Object.keys(objectA).concat(Object.keys(objectB)))
    ).sort();
    return keys.flatMap((key) =>
      diffObjects(
        objectA[key],
        objectB[key],
        prefix ? prefix + "." + key : key
      )
    );
  }
  const status: DiffEntry["status"] =
    a === undefined
      ? "only-b"
      : b === undefined
        ? "only-a"
        : stable(a) === stable(b)
          ? "same"
          : "changed";
  return [{ path: prefix, category: categoryFor(prefix), status, a, b }];
}

export function consistencyFindings(
  browser: BrowserCapture | null,
  peet: Record<string, unknown> | null
): ConsistencyFinding[] {
  if (!browser) return [];
  const findings: ConsistencyFinding[] = [];
  const browserData = browser.browser;
  const browserUa = browserData.userAgent;
  const peetUa = peet?.user_agent;
  if (
    typeof browserUa === "string" &&
    typeof peetUa === "string" &&
    browserUa !== peetUa
  ) {
    findings.push({
      id: "ua-cross-layer",
      level: "risk",
      title: "User-Agent differs across layers",
      detail:
        "The JavaScript-visible User-Agent does not match the value observed by tls.peet.ws."
    });
  }

  const platform = browserData.platform;
  if (typeof browserUa === "string" && typeof platform === "string") {
    const mismatch =
      (/Windows/i.test(browserUa) && !/Win/i.test(platform)) ||
      (/Macintosh/i.test(browserUa) && !/Mac/i.test(platform)) ||
      (/Linux/i.test(browserUa) && !/Linux/i.test(platform));
    if (mismatch) {
      findings.push({
        id: "platform-ua",
        level: "warning",
        title: "Platform claim is inconsistent",
        detail:
          "The User-Agent and navigator.platform disagree. navigator.platform reported " +
          platform +
          "."
      });
    }
  }

  const worker = browser.workers.navigator as Record<string, unknown> | undefined;
  if (
    worker &&
    typeof worker.userAgent === "string" &&
    typeof browserUa === "string" &&
    worker.userAgent !== browserUa
  ) {
    findings.push({
      id: "worker-ua",
      level: "warning",
      title: "Window and worker identities differ",
      detail: "The dedicated worker exposes a different User-Agent than the main window."
    });
  }

  if (browser.automation.classification === "automation-detected") {
    findings.push({
      id: "automation-detected",
      level: "risk",
      title: "Strong automation evidence",
      detail:
        "At least one high-confidence WebDriver or automation-framework marker was detected."
    });
  } else if (
    browser.automation.classification === "cdp-observed" ||
    browser.automation.classification === "devtools-likely"
  ) {
    findings.push({
      id: "runtime-observed",
      level: "warning",
      title: "Runtime serialization observed",
      detail:
        "Error getter serialization occurred. Open DevTools and automation CDP clients are both possible causes."
    });
  }

  if (!findings.length) {
    findings.push({
      id: "basic-consistency",
      level: "info",
      title: "No basic contradiction found",
      detail:
        peet
          ? "The currently implemented browser, worker and transport identity checks agree."
          : "The browser and worker identity checks agree. Import Peet JSON for transport checks."
    });
  }
  return findings;
}
