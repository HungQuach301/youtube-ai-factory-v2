"use client";

import { useCallback, useEffect, useState } from "react";

type Run = {
  id: string;
  status: string;
  objective: string;
  currentStep: string;
  blockerJson: string;
  createdAt: string;
};

type Event = {
  id: string;
  ordinal: number;
  eventType: string;
  payloadJson: string;
  createdAt: string;
};

type Snapshot = {
  actor: { displayName: string; email: string; role: string };
  channel: null | { id: string; name: string; status: string; locale: string };
  identityContract: null | { approvalState: string; version: number; canonicalHash: string };
  decision: null | { decisionKey: string; evidenceHash: string };
  pillar: null | { id: string; name: string; version: number };
  episodes: Array<{ id: string; sequence: number; title: string; status: string }>;
  runs: Run[];
  latestRunEvents: Event[];
  activationBlockers: string[];
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function OperatorClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [objective, setObjective] = useState("Persist the approved AI-Era Money Defense channel strategy and verify Production read-back.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/operator", { cache: "no-store" });
    const body = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to read Production state");
    setSnapshot(body);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/operator", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to read Production state");
        if (active) setSnapshot(body);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { active = false; };
  }, []);

  async function submitCommand() {
    setBusy(true);
    setError("");
    try {
      const idempotencyKey = await sha256(`PREPARE_CHANNEL|HP-01|${objective.trim()}`);
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "PREPARE_CHANNEL", objective, idempotencyKey }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Command failed");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const latestRun = snapshot?.runs[0];
  const blockers = latestRun ? JSON.parse(latestRun.blockerJson) as string[] : snapshot?.activationBlockers ?? [];

  return (
    <div className="operator-layout">
      <section className="operator-command-card">
        <div className="operator-card-heading">
          <div><p className="eyebrow">OWNER COMMAND</p><h2>Prepare the approved channel</h2></div>
          <span className="write-badge">D1 WRITE</span>
        </div>
        <p className="operator-help">This creates a real command, run, owner decision, channel contract, pillar and ten queued episodes. It does not activate providers or publishing.</p>
        <label htmlFor="objective">Operational objective</label>
        <textarea id="objective" value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} maxLength={500} />
        <button type="button" onClick={submitCommand} disabled={busy || objective.trim().length < 12}>
          {busy ? "Executing…" : "Run PREPARE_CHANNEL"}
        </button>
        {error ? <p className="operator-error" role="alert">{error}</p> : null}
        <p className="operator-boundary">Idempotent · owner-authenticated · zero provider cost · auto-publish OFF</p>
      </section>

      <aside className="operator-state-card">
        <div className="operator-card-heading">
          <div><p className="eyebrow">PRODUCTION READ-BACK</p><h2>Current state</h2></div>
          <span className={`state-badge ${snapshot?.channel ? "ready" : "waiting"}`}>{snapshot?.channel?.status ?? "NOT PREPARED"}</span>
        </div>
        <dl className="operator-state-list">
          <div><dt>Actor</dt><dd>{snapshot?.actor.displayName ?? "Authenticating…"}</dd></div>
          <div><dt>Role</dt><dd>{snapshot?.actor.role ?? "—"}</dd></div>
          <div><dt>Channel</dt><dd>{snapshot?.channel?.name ?? "No D1 channel record"}</dd></div>
          <div><dt>Contract</dt><dd>{snapshot?.identityContract ? `v${snapshot.identityContract.version} · ${snapshot.identityContract.approvalState}` : "—"}</dd></div>
          <div><dt>Decision</dt><dd>{snapshot?.decision?.decisionKey ?? "—"}</dd></div>
          <div><dt>Pillar</dt><dd>{snapshot?.pillar?.name ?? "—"}</dd></div>
          <div><dt>Episodes</dt><dd>{snapshot?.episodes.length ?? 0} persisted</dd></div>
          <div><dt>Latest run</dt><dd>{latestRun?.status ?? "No run yet"}</dd></div>
          <div><dt>Step</dt><dd>{latestRun?.currentStep ?? "—"}</dd></div>
        </dl>
      </aside>

      <section className="operator-timeline-card">
        <div className="operator-card-heading">
          <div><p className="eyebrow">APPEND-ONLY RECEIPT</p><h2>Latest run events</h2></div>
          <span className="verified-badge">{snapshot?.latestRunEvents.length ?? 0} EVENTS</span>
        </div>
        {snapshot?.latestRunEvents.length ? (
          <ol className="event-timeline">
            {snapshot.latestRunEvents.map((event) => (
              <li key={event.id}><span>{String(event.ordinal).padStart(2, "0")}</span><div><strong>{event.eventType}</strong><small>{event.createdAt}</small></div></li>
            ))}
          </ol>
        ) : <p className="operator-empty">Issue the first command to create an auditable Production receipt.</p>}
      </section>

      <aside className="operator-blocker-card">
        <p className="eyebrow">ACTIVATION BOUNDARY</p><h2>Still fail-closed</h2>
        <ul>{blockers.map((blocker) => <li key={blocker}>{blocker.replaceAll("_", " ")}</li>)}</ul>
        <p>PREPARED is a valid completed outcome. ACTIVE remains prohibited until every blocker has real evidence.</p>
      </aside>

      <section className="operator-deliverables-card">
        <div className="operator-card-heading">
          <div><p className="eyebrow">PERSISTED DELIVERABLES</p><h2>Production episode queue</h2></div>
          <span className="verified-badge">{snapshot?.episodes.length ?? 0} D1 ROWS</span>
        </div>
        {snapshot?.episodes.length ? (
          <ol className="operator-episode-list">
            {snapshot.episodes.map((episode) => (
              <li key={episode.id}><span>{String(episode.sequence).padStart(2, "0")}</span><strong>{episode.title}</strong><small>{episode.status}</small></li>
            ))}
          </ol>
        ) : <p className="operator-empty">The approved queue will appear here only after PREPARE_CHANNEL commits to D1.</p>}
      </section>
    </div>
  );
}
