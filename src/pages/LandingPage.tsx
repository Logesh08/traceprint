import { useState } from "react";
import {
  ArrowRight,
  Braces,
  Fingerprint,
  GitCompareArrows,
  Network,
  ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Spinner } from "../components/Icons";
import { createSession, sessionHash } from "../lib/session";

const features = [
  {
    icon: Fingerprint,
    title: "Browser surfaces",
    text: "Identity, rendering, hardware, locale, workers, fonts, WebGL, canvas and audio."
  },
  {
    icon: ShieldCheck,
    title: "Automation and CDP",
    text: "Runtime serialization, WebDriver markers, injected globals, integrity and interaction evidence."
  },
  {
    icon: Network,
    title: "Transport evidence",
    text: "Import Peet reports for TLS, JA3, JA4, HTTP/2 settings, headers and cross-layer checks."
  }
];

export function LandingPage() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function begin() {
    setCreating(true);
    setError("");
    try {
      const secrets = await createSession();
      navigate("/session/" + secrets.id + "#" + sessionHash(secrets));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a session.");
      setCreating(false);
    }
  }

  return (
    <main className="site-shell landing">
      <nav className="top-nav">
        <Brand />
        <a
          className="button button-quiet button-small"
          href="https://github.com/Logesh08/traceprint"
          target="_blank"
          rel="noreferrer"
        >
          <Braces size={16} /> Source
        </a>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span /> Cross-layer fingerprint laboratory</div>
        <h1>See exactly where two clients <em>stop matching.</em></h1>
        <p className="hero-copy">
          Capture browser and automation evidence from two controlled links, add
          server-observed TLS and HTTP/2 reports, then turn thousands of raw values
          into one explained comparison.
        </p>
        <div className="hero-actions">
          <button className="button button-primary button-large" onClick={begin} disabled={creating}>
            {creating ? <Spinner /> : <GitCompareArrows size={19} />}
            {creating ? "Creating laboratory…" : "Create comparison"}
            {!creating && <ArrowRight size={18} />}
          </button>
          <span>Anonymous · expires after 24 hours</span>
        </div>
        {error && <p className="inline-error">{error}</p>}
      </section>

      <section className="feature-grid">
        {features.map((feature, index) => (
          <article className="feature-card" key={feature.title}>
            <header>
              <span className="feature-icon"><feature.icon size={19} /></span>
              <span className="feature-number">0{index + 1}</span>
            </header>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="process-strip">
        <div><span>A</span><strong>Open first capture link</strong></div>
        <i />
        <div><span>B</span><strong>Open second capture link</strong></div>
        <i />
        <div><span>∆</span><strong>Inspect the explained diff</strong></div>
      </section>
    </main>
  );
}
