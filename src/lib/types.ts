export type Side = "a" | "b";
export type Confidence = "low" | "medium" | "high";
export type SignalStatus = "clear" | "observed" | "detected" | "unsupported" | "error";

export interface ProbeSignal {
  id: string;
  label: string;
  group: "webdriver" | "runtime" | "framework" | "integrity" | "interaction";
  status: SignalStatus;
  confidence: Confidence;
  summary: string;
  evidence?: unknown;
  caveat?: string;
}

export interface AutomationReport {
  classification:
    | "no-obvious-automation"
    | "cdp-observed"
    | "devtools-likely"
    | "automation-likely"
    | "automation-detected";
  score: number;
  cdp?: {
    detected: boolean;
    verdict: "yes" | "no";
    sources: string[];
  };
  signals: ProbeSignal[];
  runtime: {
    early: TraceprintRuntimeObservation[];
    late: TraceprintRuntimeObservation[];
    prototype?: TraceprintPrototypeObservation[];
    debuggerWorkerDelayMs: number | null;
  };
  interaction?: Record<string, unknown>;
}

export interface BrowserCapture {
  schemaVersion: 1;
  capturedAt: string;
  durationMs: number;
  browser: Record<string, unknown>;
  screen: Record<string, unknown>;
  locale: Record<string, unknown>;
  hardware: Record<string, unknown>;
  graphics: Record<string, unknown>;
  canvas: Record<string, unknown>;
  audio: Record<string, unknown>;
  fonts: Record<string, unknown>;
  features: Record<string, unknown>;
  workers: Record<string, unknown>;
  automation: AutomationReport;
}

export interface CaptureRecord {
  browser: BrowserCapture | null;
  browserCapturedAt: string | null;
  peet: Record<string, unknown> | null;
  peetCapturedAt: string | null;
}

export interface SessionPayload {
  id: string;
  createdAt: string;
  expiresAt: string;
  captures: Record<Side, CaptureRecord>;
}

export interface SessionSecrets {
  id: string;
  ownerToken: string;
  sideTokens: Record<Side, string>;
  createdAt: string;
  expiresAt: string;
}

export interface DiffEntry {
  path: string;
  category: string;
  status: "same" | "changed" | "only-a" | "only-b";
  a: unknown;
  b: unknown;
}

export interface ConsistencyFinding {
  id: string;
  level: "info" | "warning" | "risk";
  title: string;
  detail: string;
}
