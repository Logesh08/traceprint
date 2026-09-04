import type { AutomationReport, ProbeSignal } from "./types";

const FRAMEWORK_GLOBALS = [
  "__pwInitScripts",
  "__playwright__binding__",
  "_phantom",
  "callPhantom",
  "__nightmare",
  "domAutomation",
  "domAutomationController"
];

function runtimeObservation(label: string): Promise<TraceprintRuntimeObservation> {
  const startedAt = performance.now();
  const observation: TraceprintRuntimeObservation = {
    label,
    emittedAtMs: 0,
    stackAccesses: 0,
    nameAccesses: 0,
    firstAccessAtMs: null,
    settledAtMs: null
  };
  const error = new Error("traceprint-" + label);
  const record = (field: "stackAccesses" | "nameAccesses") => {
    observation[field] += 1;
    if (observation.firstAccessAtMs === null) {
      observation.firstAccessAtMs = Number((performance.now() - startedAt).toFixed(3));
    }
  };

  try {
    Object.defineProperty(error, "stack", {
      configurable: true,
      enumerable: false,
      get() {
        record("stackAccesses");
        return "Error: traceprint-" + label;
      }
    });
    Object.defineProperty(error, "name", {
      configurable: true,
      enumerable: false,
      get() {
        record("nameAccesses");
        return "Error";
      }
    });
    console.debug("[Traceprint runtime probe " + label + "]", error);
  } catch (caught) {
    observation.error = caught instanceof Error ? caught.message : String(caught);
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      observation.settledAtMs = Number((performance.now() - startedAt).toFixed(3));
      resolve(observation);
    }, 90);
  });
}

function prototypeSerializationObservation(
  label: string
): Promise<TraceprintPrototypeObservation> {
  const startedAt = performance.now();
  const observation: TraceprintPrototypeObservation = {
    label,
    emittedAtMs: 0,
    ownKeysAccesses: 0,
    firstAccessAtMs: null,
    settledAtMs: null
  };

  try {
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          observation.ownKeysAccesses += 1;
          if (observation.firstAccessAtMs === null) {
            observation.firstAccessAtMs = Number(
              (performance.now() - startedAt).toFixed(3)
            );
          }
          return [];
        }
      }
    );
    const value = Object.create(trap) as Record<string, never>;
    Reflect.apply(console.groupEnd, console, [value]);
  } catch (caught) {
    observation.error = caught instanceof Error ? caught.message : String(caught);
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      observation.settledAtMs = Number((performance.now() - startedAt).toFixed(3));
      resolve(observation);
    }, 90);
  });
}

export function detectCdpRuntime(
  observations: Array<Pick<TraceprintRuntimeObservation, "stackAccesses" | "nameAccesses">>,
  prototypeObservations: Array<Pick<TraceprintPrototypeObservation, "ownKeysAccesses">> = []
) {
  const stackAccesses = observations.reduce(
    (total, item) => total + item.stackAccesses,
    0
  );
  const nameAccesses = observations.reduce(
    (total, item) => total + item.nameAccesses,
    0
  );
  const prototypeOwnKeysAccesses = prototypeObservations.reduce(
    (total, item) => total + item.ownKeysAccesses,
    0
  );

  return {
    detected: stackAccesses > 0 || prototypeOwnKeysAccesses > 0,
    stackAccesses,
    nameAccesses,
    prototypeOwnKeysAccesses
  };
}

async function debuggerWorkerDelay(): Promise<number | null> {
  if (typeof Worker === "undefined") return null;
  const source =
    "self.onmessage=function(){var start=performance.now();debugger;postMessage(performance.now()-start)}";
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(250), 250);
    worker.onmessage = (event: MessageEvent<number>) => {
      window.clearTimeout(timer);
      finish(Number(event.data.toFixed(3)));
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    worker.postMessage("run");
  });
}

function nativeShape(value: unknown) {
  if (typeof value !== "function") return null;
  try {
    const source = Function.prototype.toString.call(value);
    return {
      nativeLike: /\{\s*\[native code\]\s*\}/.test(source),
      source
    };
  } catch (error) {
    return { nativeLike: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function statusSignal(
  id: string,
  label: string,
  group: ProbeSignal["group"],
  detected: boolean,
  confidence: ProbeSignal["confidence"],
  hit: string,
  clear: string,
  evidence?: unknown,
  caveat?: string
): ProbeSignal {
  return {
    id,
    label,
    group,
    status: detected ? "detected" : "clear",
    confidence,
    summary: detected ? hit : clear,
    evidence,
    caveat
  };
}

export async function collectAutomationReport(): Promise<AutomationReport> {
  const signals: ProbeSignal[] = [];
  const ownWindowNames = Object.getOwnPropertyNames(window);
  const early = window.__TRACEPRINT_EARLY__;

  signals.push(
    statusSignal(
      "navigator-webdriver",
      "navigator.webdriver",
      "webdriver",
      navigator.webdriver === true,
      "high",
      "The browser explicitly reports WebDriver control.",
      "The WebDriver flag is not asserted.",
      navigator.webdriver
    )
  );

  const cdcGlobals = ownWindowNames.filter((name) => /^cdc_[a-z0-9_]+$/i.test(name));
  signals.push(
    statusSignal(
      "chromedriver-globals",
      "ChromeDriver globals",
      "framework",
      cdcGlobals.length > 0,
      "high",
      "ChromeDriver-style cdc globals are exposed.",
      "No cdc-prefixed globals were found.",
      cdcGlobals
    )
  );

  const frameworkGlobals = FRAMEWORK_GLOBALS.filter((name) => name in window);
  signals.push(
    statusSignal(
      "framework-globals",
      "Automation framework globals",
      "framework",
      frameworkGlobals.length > 0,
      "high",
      "Known Playwright, PhantomJS, Nightmare or DOM automation markers are present.",
      "No known framework globals were found.",
      frameworkGlobals
    )
  );

  const headlessUa = /HeadlessChrome/i.test(navigator.userAgent);
  signals.push(
    statusSignal(
      "headless-user-agent",
      "Headless user-agent token",
      "webdriver",
      headlessUa,
      "high",
      "The User-Agent contains the legacy HeadlessChrome marker.",
      "No legacy headless token was found.",
      navigator.userAgent
    )
  );

  const webdriverDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, "webdriver");
  const ownWebdriverDescriptor = Object.getOwnPropertyDescriptor(navigator, "webdriver");
  const descriptorEvidence = {
    prototype: webdriverDescriptor
      ? {
          configurable: webdriverDescriptor.configurable,
          enumerable: webdriverDescriptor.enumerable,
          getter: nativeShape(webdriverDescriptor.get)
        }
      : null,
    own: ownWebdriverDescriptor
      ? {
          configurable: ownWebdriverDescriptor.configurable,
          enumerable: ownWebdriverDescriptor.enumerable,
          getter: nativeShape(ownWebdriverDescriptor.get)
        }
      : null
  };
  const webdriverPatched =
    Boolean(ownWebdriverDescriptor) ||
    Boolean(webdriverDescriptor?.get && nativeShape(webdriverDescriptor.get)?.nativeLike === false);
  signals.push(
    statusSignal(
      "webdriver-descriptor",
      "WebDriver descriptor integrity",
      "integrity",
      webdriverPatched,
      "medium",
      "The webdriver property shape differs from the expected native prototype shape.",
      "The webdriver property has a native-like prototype descriptor.",
      descriptorEvidence,
      "Browser extensions and privacy tools can also replace native descriptors."
    )
  );

  const late = [await runtimeObservation("app-start"), await runtimeObservation("app-repeat")];
  const latePrototype = [
    await prototypeSerializationObservation("app-prototype")
  ];
  const earlyRuntime = early?.runtime ? early.runtime.map((item) => ({ ...item })) : [];
  const earlyPrototype = early?.prototypeRuntime
    ? early.prototypeRuntime.map((item) => ({ ...item }))
    : [];
  const allRuntime = earlyRuntime.concat(late);
  const allPrototype = earlyPrototype.concat(latePrototype);
  const runtimeEvidence = detectCdpRuntime(allRuntime, allPrototype);
  const delay = runtimeEvidence.detected ? await debuggerWorkerDelay() : null;
  const devtoolsTiming = delay !== null && delay >= 180;

  signals.push({
    id: "runtime-serialization",
    label: "CDP Runtime serialization",
    group: "runtime",
    status: runtimeEvidence.detected ? "detected" : "clear",
    confidence: runtimeEvidence.detected ? "high" : "medium",
    summary:
      runtimeEvidence.detected
        ? "CDP Runtime/Console serialization was observed during a controlled console probe."
        : "No detectable CDP Runtime/Console serialization side effect was observed.",
    evidence: {
      detected: runtimeEvidence.detected,
      stackAccesses: runtimeEvidence.stackAccesses,
      nameAccesses: runtimeEvidence.nameAccesses,
      prototypeOwnKeysAccesses: runtimeEvidence.prototypeOwnKeysAccesses,
      observations: allRuntime,
      prototypeObservations: allPrototype,
      debuggerWorkerDelayMs: delay
    },
    caveat:
      runtimeEvidence.detected
        ? "This means a detectable Runtime/Console domain is active. Open DevTools can cause the same result, so it does not prove automation."
        : "No signal is not proof that CDP is absent: a controller can avoid Runtime.enable/Console.enable, and Chromium can patch serialization paths."
  });

  if (runtimeEvidence.detected) {
    signals.push({
      id: "devtools-discriminator",
      label: "DevTools timing discriminator",
      group: "runtime",
      status: devtoolsTiming ? "observed" : "clear",
      confidence: "low",
      summary: devtoolsTiming
        ? "The isolated debugger worker exceeded the timing threshold, making open DevTools more plausible."
        : "The debugger worker did not show a DevTools-sized pause.",
      evidence: { debuggerWorkerDelayMs: delay, thresholdMs: 180 },
      caveat: "Timing varies across machines and debugger settings, so it is supporting evidence only."
    });
  }

  let score = 0;
  if (navigator.webdriver === true) score += 100;
  if (cdcGlobals.length) score += 100;
  if (frameworkGlobals.length) score += 90;
  if (headlessUa) score += 80;
  if (webdriverPatched) score += 20;
  if (runtimeEvidence.detected) score += devtoolsTiming ? 10 : 35;
  score = Math.min(score, 100);

  let classification: AutomationReport["classification"] = "no-obvious-automation";
  if (score >= 90) classification = "automation-detected";
  else if (score >= 55) classification = "automation-likely";
  else if (runtimeEvidence.detected && devtoolsTiming) classification = "devtools-likely";
  else if (runtimeEvidence.detected) classification = "cdp-observed";

  return {
    classification,
    score,
    cdp: {
      detected: runtimeEvidence.detected,
      verdict: runtimeEvidence.detected ? "yes" : "no",
      sources: [
        ...(runtimeEvidence.stackAccesses > 0 ? ["error-stack-serialization"] : []),
        ...(runtimeEvidence.prototypeOwnKeysAccesses > 0
          ? ["prototype-ownkeys-serialization"]
          : [])
      ]
    },
    signals,
    runtime: {
      early: earlyRuntime,
      late,
      prototype: allPrototype,
      debuggerWorkerDelayMs: delay
    }
  };
}

export function addInteractionEvidence(
  report: AutomationReport,
  event: React.MouseEvent<HTMLButtonElement>
): AutomationReport {
  const interaction = {
    isTrusted: event.nativeEvent.isTrusted,
    detail: event.detail,
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    pointerType:
      "pointerType" in event.nativeEvent
        ? (event.nativeEvent as PointerEvent).pointerType
        : null,
    capturedAt: new Date().toISOString()
  };
  const synthetic = !event.nativeEvent.isTrusted;
  const coordinateAnomaly =
    event.pageX === event.screenX &&
    event.pageY === event.screenY &&
    window.outerHeight - window.innerHeight > 1;
  const signals = report.signals.filter(
    (signal) => signal.id !== "untrusted-interaction" && signal.id !== "coordinate-anomaly"
  );
  signals.push(
    statusSignal(
      "untrusted-interaction",
      "Interaction trust",
      "interaction",
      synthetic,
      "high",
      "The completion event was not browser-trusted.",
      "The completion event was browser-trusted.",
      interaction,
      "Calling element.click() from page JavaScript also creates an untrusted event."
    )
  );
  signals.push(
    statusSignal(
      "coordinate-anomaly",
      "Input coordinate relationship",
      "interaction",
      coordinateAnomaly,
      "medium",
      "Page and screen coordinates matched unexpectedly.",
      "No simple coordinate leak was observed.",
      interaction,
      "Window managers and fullscreen configurations can affect coordinate relationships."
    )
  );
  const addedScore = (synthetic ? 35 : 0) + (coordinateAnomaly ? 15 : 0);
  const score = Math.min(100, report.score + addedScore);
  return {
    ...report,
    score,
    classification:
      score >= 90
        ? "automation-detected"
        : score >= 55
          ? "automation-likely"
          : report.classification,
    signals,
    interaction
  };
}
