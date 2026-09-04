/// <reference types="vite/client" />

interface TraceprintRuntimeObservation {
  label: string;
  emittedAtMs: number;
  stackAccesses: number;
  nameAccesses: number;
  firstAccessAtMs: number | null;
  settledAtMs: number | null;
  error?: string;
}

interface TraceprintEarlyResult {
  version: number;
  startedAt: number;
  createdAt: string;
  webdriver: boolean;
  headlessUserAgent: boolean;
  globals: string[];
  globalsError?: string;
  runtime: TraceprintRuntimeObservation[];
}

interface Window {
  __TRACEPRINT_EARLY__?: TraceprintEarlyResult;
}
