import { ArrowLeft, Globe2, LockKeyhole } from "lucide-react";
import { lazy, Suspense, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./globe.css";

const GlobeApp = lazy(() => import("./GlobeApp").then((module) => ({ default: module.GlobeApp })));
const accessKey = "mhm-globe-preview";

function hasAccess() {
  try { return sessionStorage.getItem(accessKey) === "1"; }
  catch { return false; }
}

function PreviewGate() {
  const [unlocked, setUnlocked] = useState(hasAccess);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  if (unlocked) {
    return <Suspense fallback={<div className="globe-gate-loading">Loading globe...</div>}><GlobeApp /></Suspense>;
  }

  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== "ken") { setError(true); return; }
    try { sessionStorage.setItem(accessKey, "1"); } catch { /* This tab can still open the preview. */ }
    setPassword("");
    setError(false);
    setUnlocked(true);
  };

  return <main className="globe-gate">
    <header className="globe-gate-header">
      <a href="./index.html" aria-label="Back to music map" title="Back to music map"><ArrowLeft size={18} /></a>
      <span><Globe2 size={19} aria-hidden="true" /><strong>MHM</strong><small>GEOGRAPHY</small></span>
    </header>
    <section className="globe-gate-content" aria-labelledby="globe-gate-title">
      <div className="globe-gate-heading"><LockKeyhole size={20} aria-hidden="true" /><span>PRIVATE PREVIEW</span></div>
      <h1 id="globe-gate-title">Globus</h1>
      <form onSubmit={unlock}>
        <label htmlFor="globe-preview-password">Passord</label>
        <input id="globe-preview-password" type="password" autoComplete="off" autoFocus value={password}
          aria-invalid={error} aria-describedby={error ? "globe-gate-error" : undefined}
          onChange={(event) => { setPassword(event.target.value); if (error) setError(false); }} />
        {error && <p id="globe-gate-error" role="alert">Feil passord.</p>}
        <button type="submit">Åpne globus</button>
      </form>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<PreviewGate />);
