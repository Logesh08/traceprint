import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  Fingerprint,
  MousePointer2,
  ScanLine
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Spinner } from "../components/Icons";
import { addInteractionEvidence } from "../lib/cdp";
import { collectBrowserFingerprint } from "../lib/probes";
import { readCaptureToken, saveBrowserCapture } from "../lib/session";
import type { BrowserCapture, Side } from "../lib/types";

type CaptureState = "collecting" | "saving" | "ready" | "complete" | "error";

export function CapturePage() {
  const { id = "", side: rawSide = "" } = useParams();
  const side = rawSide === "a" || rawSide === "b" ? rawSide : null;
  const [state, setState] = useState<CaptureState>("collecting");
  const [message, setMessage] = useState("Running early and full browser probes…");
  const [capture, setCapture] = useState<BrowserCapture | null>(null);
  const started = useRef(false);
  const token = readCaptureToken();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!side || !token) {
      setState("error");
      setMessage("This capture URL is incomplete or invalid.");
      return;
    }
    collectBrowserFingerprint()
      .then(async (result) => {
        setCapture(result);
        setState("saving");
        setMessage("Saving the baseline evidence…");
        await saveBrowserCapture(id, side, token, result);
        setState("ready");
        setMessage("Baseline saved. Complete the interaction check.");
      })
      .catch((caught) => {
        setState("error");
        setMessage(caught instanceof Error ? caught.message : "The capture failed.");
      });
  }, [id, side, token]);

  async function finish(event: React.MouseEvent<HTMLButtonElement>) {
    if (!capture || !side || !token) return;
    try {
      setState("saving");
      setMessage("Adding interaction evidence…");
      const updated = {
        ...capture,
        capturedAt: new Date().toISOString(),
        automation: addInteractionEvidence(capture.automation, event)
      };
      setCapture(updated);
      await saveBrowserCapture(id, side, token, updated);
      setState("complete");
      setMessage("Capture complete. You can return to the comparison.");
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Could not save the interaction.");
    }
  }

  const observed =
    capture?.automation.signals.filter(
      (signal) => signal.status === "observed" || signal.status === "detected"
    ).length ?? 0;

  return (
    <main className="site-shell capture-shell">
      <nav className="top-nav">
        <Brand />
        <span className={"side-pill side-" + (side ?? "a")}>CLIENT {(side ?? "?").toUpperCase()}</span>
      </nav>

      <section className="capture-card panel">
        <header className="panel-head">
          <div>
            <div className="eyebrow"><span /> Live browser laboratory</div>
            <h1>Capture client {side?.toUpperCase()}</h1>
            <p>This page records what site JavaScript can observe and tests for automation/CDP side effects.</p>
          </div>
          <ScanLine className="capture-glyph" size={42} />
        </header>

        <div className={"capture-status state-" + state}>
          <span className="status-icon">
            {state === "error" ? (
              <CircleAlert size={21} />
            ) : state === "complete" ? (
              <Check size={21} />
            ) : state === "collecting" || state === "saving" ? (
              <Spinner />
            ) : (
              <Fingerprint size={21} />
            )}
          </span>
          <div>
            <strong>{message}</strong>
            <small>
              {capture
                ? capture.automation.classification.replaceAll("-", " ") +
                  " · " +
                  observed +
                  " notable signal" +
                  (observed === 1 ? "" : "s")
                : "The earliest Runtime probe executed before React loaded."}
            </small>
          </div>
        </div>

        {capture && (
          <div className="signal-preview">
            {capture.automation.signals.slice(0, 6).map((signal) => (
              <div key={signal.id}>
                <span className={"signal-dot signal-" + signal.status} />
                <span><strong>{signal.label}</strong><small>{signal.summary}</small></span>
                <b>{signal.status}</b>
              </div>
            ))}
          </div>
        )}

        <button
          className="button button-primary button-large capture-button"
          disabled={state !== "ready"}
          onClick={finish}
        >
          <MousePointer2 size={19} />
          {state === "complete" ? "Interaction recorded" : "Complete interaction check"}
        </button>

        <footer className="capture-note">
          No permission prompts or deliberate browser-crashing tests are used. Runtime serialization can also be caused by open DevTools.
        </footer>
      </section>

      <p className="capture-footer">
        <Link to="/"><ExternalLink size={14} /> Open Traceprint home</Link>
      </p>
    </main>
  );
}
