import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Clipboard,
  Download,
  ExternalLink,
  FileJson,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import { useParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Spinner } from "../components/Icons";
import { consistencyFindings, diffObjects } from "../lib/diff";
import { normalizePeet } from "../lib/peet";
import {
  createSession,
  loadSession,
  readSessionHash,
  savePeet,
  sessionHash
} from "../lib/session";
import type {
  AutomationReport,
  CaptureRecord,
  DiffEntry,
  ProbeSignal,
  SessionPayload,
  Side
} from "../lib/types";

type Tab = "overview" | "diff" | "automation" | "transport" | "raw";

function cdpDetected(report: AutomationReport | undefined): boolean | null {
  if (!report) return null;
  if (report.cdp) return report.cdp.detected;

  const runtime = report.signals.find((signal) => signal.id === "runtime-serialization");
  const evidence = runtime?.evidence as
    | {
        observations?: Array<{ stackAccesses?: number }>;
        prototypeObservations?: Array<{ ownKeysAccesses?: number }>;
      }
    | undefined;
  if (evidence?.observations || evidence?.prototypeObservations) {
    return Boolean(
      evidence.observations?.some((item) => (item.stackAccesses ?? 0) > 0) ||
        evidence.prototypeObservations?.some((item) => (item.ownKeysAccesses ?? 0) > 0)
    );
  }
  return runtime?.status === "detected" || runtime?.status === "observed";
}

function overallScore(capture: CaptureRecord): number | null {
  if (!capture.browser) return null;
  const report = capture.browser.automation;
  const legacyNameOnlyPenalty =
    !report.cdp && report.classification === "cdp-observed" && !cdpDetected(report) ? 35 : 0;
  const automationPenalty = Math.max(0, report.score - legacyNameOnlyPenalty);
  const consistencyPenalty = consistencyFindings(capture.browser, capture.peet).reduce(
    (total, finding) => {
      if (finding.id === "automation-detected" || finding.id === "runtime-observed") {
        return total;
      }
      return total + (finding.level === "risk" ? 15 : finding.level === "warning" ? 6 : 0);
    },
    0
  );
  return Math.max(0, 100 - automationPenalty - consistencyPenalty);
}

function yesNo(value: boolean | null) {
  return value === null ? "—" : value ? "Yes" : "No";
}

function formatValue(value: unknown, limit = 320) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value || '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const encoded = JSON.stringify(value);
    return encoded.length > limit ? encoded.slice(0, limit - 1) + "…" : encoded;
  } catch {
    return String(value);
  }
}

function timeLabel(value: string | null) {
  if (!value) return "Waiting";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function normalized(capture: CaptureRecord) {
  const data = capture.browser;
  return {
    browser: data?.browser,
    screen: data?.screen,
    locale: data?.locale,
    hardware: data?.hardware,
    graphics: data?.graphics,
    canvas: data?.canvas,
    audio: data?.audio,
    fonts: data?.fonts,
    features: data?.features,
    workers: data?.workers,
    automation: data?.automation,
    serverObserved: (data as (typeof data & { serverObserved?: Record<string, unknown> }) | null)
      ?.serverObserved,
    transport: normalizePeet(capture.peet)
  };
}

function ClipboardButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button className="button button-quiet button-small" onClick={copy}>
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function SideCard({
  side,
  sessionId,
  capture,
  token,
  ownerToken,
  onSaved
}: {
  side: Side;
  sessionId: string;
  capture: CaptureRecord;
  token: string;
  ownerToken: string;
  onSaved: () => void;
}) {
  const [peetJson, setPeetJson] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const captureUrl =
    window.location.origin +
    "/capture/" +
    sessionId +
    "/" +
    side +
    "#token=" +
    token;

  useEffect(() => {
    if (capture.peet && !peetJson) setPeetJson(JSON.stringify(capture.peet, null, 2));
  }, [capture.peet, peetJson]);

  async function importPeet() {
    setSaving(true);
    setMessage("");
    try {
      await savePeet(sessionId, side, ownerToken, peetJson);
      setMessage("Transport evidence saved");
      onSaved();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save Peet JSON.");
    } finally {
      setSaving(false);
    }
  }

  const cdp = cdpDetected(capture.browser?.automation);
  const score = overallScore(capture);

  return (
    <article className={"side-card panel side-card-" + side}>
      <header className="side-card-head">
        <div className="side-title">
          <span>{side.toUpperCase()}</span>
          <div><strong>Client {side.toUpperCase()}</strong><small>Independent capture lane</small></div>
        </div>
        <span className={"state-badge " + (capture.browser ? "ready" : "")}>
          {capture.browser ? "Browser captured" : "Awaiting browser"}
        </span>
      </header>

      <div className="side-card-body">
        <section className="link-box">
          <label>Browser test link</label>
          <code>{captureUrl}</code>
          <div>
            <ClipboardButton value={captureUrl} />
            <a className="button button-quiet button-small" href={captureUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Open test
            </a>
          </div>
        </section>

        <div className="mini-metrics">
          <div><span>Browser</span><strong>{timeLabel(capture.browserCapturedAt)}</strong></div>
          <div><span>Overall score</span><strong className={score !== null && score < 70 ? "warm" : "cool"}>{score === null ? "—" : score + "/100"}</strong></div>
          <div><span>CDP detected</span><strong className={cdp === null ? "" : cdp ? "warm" : "cool"}>{yesNo(cdp)}</strong></div>
          <div><span>Transport</span><strong>{capture.peet ? "Imported" : "Waiting"}</strong></div>
        </div>

        <section className="peet-input">
          <header>
            <label htmlFor={"peet-" + side}>tls.peet.ws JSON</label>
            <a href="https://tls.peet.ws/api/all" target="_blank" rel="noreferrer">Open endpoint ↗</a>
          </header>
          <textarea
            id={"peet-" + side}
            value={peetJson}
            onChange={(event) => setPeetJson(event.target.value)}
            placeholder={"Paste Client " + side.toUpperCase() + " /api/all response…"}
            spellCheck={false}
          />
          <footer>
            <span className={message && !message.includes("saved") ? "inline-error" : "success-text"}>{message}</span>
            <button
              className="button button-primary button-small"
              disabled={saving || !peetJson.trim()}
              onClick={importPeet}
            >
              {saving ? <Spinner /> : <FileJson size={15} />}
              {saving ? "Saving…" : "Import JSON"}
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return <div className="report-metric"><span>{label}</span><strong className={tone}>{value}</strong></div>;
}

function DiffTable({ entries }: { entries: DiffEntry[] }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All"].concat(Array.from(new Set(entries.map((entry) => entry.category))).sort());
  const visible = entries.filter((entry) => {
    if (changesOnly && entry.status === "same") return false;
    if (category !== "All" && entry.category !== category) return false;
    if (query && !entry.path.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="diff-area">
      <div className="diff-controls">
        <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fields…" /></label>
        <label className="select-box"><Filter size={15} /><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className={"button button-small " + (changesOnly ? "button-primary" : "button-quiet")} onClick={() => setChangesOnly(!changesOnly)}>
          {changesOnly ? "Differences only" : "Showing all"}
        </button>
        <span>{visible.length} fields</span>
      </div>
      <div className="table-scroll">
        <table className="diff-table">
          <thead><tr><th>Field</th><th>State</th><th>Client A</th><th>Client B</th></tr></thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.path}>
                <td><code>{entry.path}</code><small>{entry.category}</small></td>
                <td><span className={"diff-state diff-" + entry.status}>{entry.status}</span></td>
                <td><pre>{formatValue(entry.a)}</pre></td>
                <td><pre>{formatValue(entry.b)}</pre></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={4} className="empty-row">No fields match this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutomationTable({ session }: { session: SessionPayload }) {
  const reports = {
    a: session.captures.a.browser?.automation,
    b: session.captures.b.browser?.automation
  };
  const ids = Array.from(
    new Set(
      (reports.a?.signals ?? [])
        .concat(reports.b?.signals ?? [])
        .map((signal) => signal.id)
    )
  );
  const lookup = (side: Side, id: string): ProbeSignal | undefined =>
    reports[side]?.signals.find((signal) => signal.id === id);
  return (
    <div>
      <div className="automation-summary">
        {(["a", "b"] as Side[]).map((side) => (
          <div key={side} className={"automation-score score-" + side}>
            <span>Client {side.toUpperCase()}</span>
            <strong className={cdpDetected(reports[side]) === null ? "" : cdpDetected(reports[side]) ? "cdp-yes" : "cdp-no"}>{yesNo(cdpDetected(reports[side]))}</strong>
            <small>CDP Runtime / Console detected</small>
          </div>
        ))}
      </div>
      <div className="signal-comparison">
        {ids.map((id) => {
          const a = lookup("a", id);
          const b = lookup("b", id);
          return (
            <article key={id}>
              <header><strong>{a?.label ?? b?.label ?? id}</strong><code>{id}</code></header>
              <div>
                {(["a", "b"] as Side[]).map((side) => {
                  const signal = side === "a" ? a : b;
                  return (
                    <section key={side} className={"signal-side signal-side-" + side}>
                      <span className={"signal-status signal-" + (signal?.status ?? "unsupported")}>{signal?.status ?? "missing"}</span>
                      <p>{signal?.summary ?? "No capture available."}</p>
                      {signal?.evidence !== undefined && <details><summary>Raw evidence</summary><pre>{JSON.stringify(signal.evidence, null, 2)}</pre></details>}
                      {signal?.caveat && <small>{signal.caveat}</small>}
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
        {!ids.length && <p className="empty-copy">Open both browser links to populate automation and CDP evidence.</p>}
      </div>
    </div>
  );
}

export function SessionPage() {
  const { id = "" } = useParams();
  const secrets = useMemo(readSessionHash, []);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [creatingNew, setCreatingNew] = useState(false);
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    if (!secrets) {
      setError("This dashboard URL is missing its private session keys.");
      setLoading(false);
      return;
    }
    try {
      setSession(await loadSession(id, secrets.owner));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the comparison.");
    } finally {
      setLoading(false);
    }
  }, [id, secrets]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const normalizedPair = useMemo(
    () =>
      session
        ? {
            a: normalized(session.captures.a),
            b: normalized(session.captures.b)
          }
        : null,
    [session]
  );
  const entries = useMemo(
    () => (normalizedPair ? diffObjects(normalizedPair.a, normalizedPair.b) : []),
    [normalizedPair]
  );
  const changed = entries.filter((entry) => entry.status !== "same").length;
  const same = entries.length - changed;

  function exportReport() {
    if (!session || !normalizedPair) return;
    const report = {
      exportedAt: new Date().toISOString(),
      session,
      normalized: normalizedPair,
      differences: entries
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "traceprint-" + id + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function startNewComparison() {
    setCreatingNew(true);
    setActionError("");
    try {
      const next = await createSession();
      window.location.assign("/session/" + next.id + "#" + sessionHash(next));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not create a comparison.");
      setCreatingNew(false);
    }
  }

  if (loading) return <main className="center-page"><Spinner /><span>Loading fingerprint laboratory…</span></main>;
  if (error || !session || !secrets) {
    return <main className="center-page error-page"><CircleAlert /><h1>Comparison unavailable</h1><p>{error}</p><a className="button button-primary" href="/">Create another session</a></main>;
  }

  const findings = {
    a: consistencyFindings(session.captures.a.browser, session.captures.a.peet),
    b: consistencyFindings(session.captures.b.browser, session.captures.b.peet)
  };
  const transportEntries = entries.filter((entry) => entry.path.startsWith("transport"));

  return (
    <main className="dashboard-shell">
      <nav className="dashboard-nav">
        <Brand compact />
        <div className="session-identity"><span>SESSION</span><code>{id.slice(0, 18)}…</code></div>
        <div className="nav-actions">
          <span className="expiry">Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.expiresAt))}</span>
          {actionError && <span className="nav-error" title={actionError}>New session failed</span>}
          <button className="button button-primary button-small" onClick={startNewComparison} disabled={creatingNew}><Plus size={15} /> {creatingNew ? "Creating…" : "New comparison"}</button>
          <button className="button button-quiet button-small" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
          <button className="button button-quiet button-small" onClick={exportReport}><Download size={15} /> Export</button>
        </div>
      </nav>

      <section className="dashboard-intro">
        <div><div className="eyebrow"><span /> Active comparison</div><h1>Client A <em>versus</em> Client B</h1><p>Open each capture lane with the environment you want to compare. Results update automatically.</p></div>
        <div className="pair-state">
          <span className={session.captures.a.browser && session.captures.b.browser ? "complete" : ""}>Browser pair</span>
          <span className={session.captures.a.peet && session.captures.b.peet ? "complete" : ""}>Transport pair</span>
        </div>
      </section>

      <section className="side-grid">
        <SideCard side="a" sessionId={id} capture={session.captures.a} token={secrets.sideTokens.a} ownerToken={secrets.owner} onSaved={refresh} />
        <div className="versus-line"><span>VS</span></div>
        <SideCard side="b" sessionId={id} capture={session.captures.b} token={secrets.sideTokens.b} ownerToken={secrets.owner} onSaved={refresh} />
      </section>

      <section className="report panel">
        <header className="report-head">
          <div><div className="eyebrow"><span /> Differential analysis</div><h2>{changed} differences across {entries.length} fields</h2></div>
          <div className="report-tabs" role="tablist">
            {([
              ["overview", "Overview"],
              ["diff", "Field diff"],
              ["automation", "Automation/CDP"],
              ["transport", "TLS/HTTP2"],
              ["raw", "Raw"]
            ] as Array<[Tab, string]>).map(([value, label]) => (
              <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
            ))}
          </div>
        </header>

        <div className="report-body">
          {tab === "overview" && (
            <>
              <div className="report-metrics">
                <Metric label="Changed" value={changed} tone="warm" />
                <Metric label="Matching" value={same} tone="cool" />
                <Metric label="Compared" value={entries.length} />
                <Metric label="CDP A / B" value={yesNo(cdpDetected(session.captures.a.browser?.automation)) + " / " + yesNo(cdpDetected(session.captures.b.browser?.automation))} tone="violet" />
              </div>
              <div className="findings-grid">
                {(["a", "b"] as Side[]).map((side) => (
                  <section key={side} className="finding-card">
                    <header><div><span>Client {side.toUpperCase()}</span><strong>Consistency findings</strong></div><ShieldAlert size={20} /></header>
                    {findings[side].length ? findings[side].map((finding) => (
                      <article key={finding.id} className={"finding finding-" + finding.level}>
                        <Sparkles size={16} /><div><strong>{finding.title}</strong><p>{finding.detail}</p></div>
                      </article>
                    )) : <p className="empty-copy">Open the browser test link to begin analysis.</p>}
                  </section>
                ))}
              </div>
            </>
          )}
          {tab === "diff" && <DiffTable entries={entries} />}
          {tab === "automation" && <AutomationTable session={session} />}
          {tab === "transport" && <DiffTable entries={transportEntries} />}
          {tab === "raw" && (
            <div className="raw-grid">
              {(["a", "b"] as Side[]).map((side) => (
                <section key={side}><header>Client {side.toUpperCase()}</header><pre>{JSON.stringify(normalizedPair?.[side], null, 2)}</pre></section>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="dashboard-footer">
        CDP Yes means Runtime/Console serialization was observed. CDP No means no detectable side effect; it cannot prove that no CDP client is attached. Open DevTools can also produce a Yes result.
      </footer>
    </main>
  );
}
