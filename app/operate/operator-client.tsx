"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Run = { id: string; status: string; objective: string; currentStep: string; createdAt: string };
type Event = { id: string; ordinal: number; eventType: string; createdAt: string };
type StageSummary = {
  stageCode: string;
  controlState: string;
  standardVersion: string | null;
  artifact: null | { artifactType: string; canonicalHash: string; immutabilityState: string; eligibilityState: string; r2Key: string };
};
type Stage06 = {
  reviewState: string;
  draftId: string;
  draftSha256: string;
  title: string;
  hook: string;
  sections: Array<{ beatId: string; title: string; narration: string; claimIds: string[] }>;
  wordCount: number;
  estimatedDurationSec: number;
  gateResults: Array<{ gate: string; state: string }>;
  evidenceR2Key: string;
  decision: null | { decisionType: string; rationale: string; createdAt: string };
};
type Stage07A = {
  reviewState: string;
  tournamentId: string;
  settingsHash: string;
  segmentCount: number;
  candidates: Array<{
    candidateId: string; routeName: string; summary: string; deliveryDirection: string;
    pauseProfile: { sentenceMs: number; beatMs: number; verificationBreakMs: number };
    emphasis: string[]; machineScore: number; machineRecommended: boolean; selected: boolean;
  }>;
  gateResults: Array<{ gate: string; state: string; evidence: string }>;
  decision: null | { decisionType: string; rationale: string; createdAt: string };
};
type Stage07B = {
  controlState: string;
  artifactSha256: string | null;
  motionClasses: string[];
  assignments: Array<{
    beatId: string; beatTitle: string; startSec: number; endSec: number;
    motionClass: string; visualRoute: string; treatment: string; acquisitionState: string;
  }>;
  distribution: Array<{ motionClass: string; count: number }>;
  gateResults: Array<{ gate: string; state: string; evidence: string }>;
};
type Stage08 = {
  controlState: string;
  artifactSha256: string | null;
  frameRate: number;
  targetFrames: number;
  targetDurationSec: number;
  maxShotDurationSec: number;
  assertionCount: number;
  shots: Array<{
    shotId: string; beatId: string; beatTitle: string; cueRole: string;
    startFrame: number; endFrame: number; startSec: number; endSec: number;
    motionClass: string; visualRoute: string; treatment: string;
    assertions: Array<{ assertion: string; state: string; evidence: string }>;
  }>;
  gateResults: Array<{ gate: string; state: string; evidence: string }>;
};
type Stage09 = {
  reviewState: string;
  controlState: string;
  artifactSha256: string | null;
  assetCount: number;
  sourceCandidatesPerShot: number;
  compositionsPerShot: number;
  duplicateRate: number;
  assets: Array<{
    assetId: string; shotId: string; beatId: string; startFrame: number; endFrame: number;
    motionClass: string; visualRoute: string; acquisitionMode: string; visualFingerprint: string;
    rightsLineage: { origin: string; license: string; sourceUri: string; state: string };
    semanticFit: { state: string; evidence: string };
  }>;
  candidates: Array<{
    candidateId: string; routeName: string; thumbnailText: string; composition: string;
    palette: { background: string; accent: string; signal: string };
    machineScore: number; machineRecommended: boolean; selected: boolean;
  }>;
  gateResults: Array<{ gate: string; state: string; evidence: string }>;
  decision: null | { decisionType: string; rationale: string; createdAt: string };
};
type Stage10 = {
  controlState: string;
  artifactSha256: string | null;
  provider: string;
  providerCallCount: number;
  totalCharacters: number;
  reservedUsd: number;
  actualUsd: number;
  calibrationEvidenceSha256: string;
  narrationSha256: string;
};
type Stage10Job = {
  state: "PENDING" | "READY" | "FAILED";
  receiptSha256: string | null;
  workerImageDigest: string | null;
  errorCode: string | null;
  updatedAt: string;
};
type Workbench = {
  run: Run;
  contract: { profile: string; assuranceMode: string; releaseEligible: boolean; providerDispatch: string; autoPublish: string };
  productionPackage: { id: string; status: string; spendCeilingUsd: number; requestCeiling: number };
  stages: StageSummary[];
  stage04: null | {
    candidates: Array<{ candidateId: string; routeName: string; hook: string; narrativeDevice: string; primaryTitle: string; thumbnailText: string; aggregateScore: number; selected: boolean }>;
    decision: null | { decisionType: string; rationale: string; createdAt: string };
  };
  stage05Prediction: null | { modelVersion: string; ctrEstimate: number; canonicalHash: string; sealedAt: string };
  stage06: Stage06 | null;
  stage07A: Stage07A | null;
  stage07B: Stage07B | null;
  stage08: Stage08 | null;
  stage09: Stage09 | null;
  stage10Job: Stage10Job | null;
  stage10: Stage10 | null;
  humanDecisionCount: number;
  allowedActions: string[];
};
type Snapshot = {
  actor: { displayName: string; email: string; role: string };
  channel: null | { id: string; name: string; status: string; locale: string };
  episodes: Array<{ id: string; sequence: number; title: string; status: string }>;
  latestRunEvents: Event[];
  activationBlockers: string[];
  voiceFingerprintState: string;
  voiceBindingCount: number;
  trackGWorkbench: Workbench | null;
};
type Receipt = { currentStep: string; stageState: string; artifactSha256?: string; decisionType?: string; replayed: boolean; stageReservedUsd?: number; stageActualUsd?: number; providerCallCount?: number; jobStatus?: string };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function OperatorClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [objective, setObjective] = useState("Persist the approved AI-Era Money Defense channel strategy and verify Production read-back.");
  const [decisionType, setDecisionType] = useState<"D2" | "D4">("D2");
  const [revisedTitle, setRevisedTitle] = useState("");
  const [revisedHook, setRevisedHook] = useState("");
  const [beatId, setBeatId] = useState("");
  const [revisedBeatNarration, setRevisedBeatNarration] = useState("");
  const [rationale, setRationale] = useState("");
  const [toneCandidateId, setToneCandidateId] = useState("");
  const [thumbnailCandidateId, setThumbnailCandidateId] = useState("");
  const [thumbnailText, setThumbnailText] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
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
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const workbench = snapshot?.trackGWorkbench ?? null;
  const stage06 = workbench?.stage06 ?? null;
  const stage07A = workbench?.stage07A ?? null;
  const stage07B = workbench?.stage07B ?? null;
  const stage08 = workbench?.stage08 ?? null;
  const stage09 = workbench?.stage09 ?? null;
  const stage10Job = workbench?.stage10Job ?? null;
  const stage10 = workbench?.stage10 ?? null;
  const effectiveTitle = revisedTitle || stage06?.title || "";
  const effectiveHook = revisedHook || stage06?.hook || "";
  const effectiveBeatId = beatId || stage06?.sections[0]?.beatId || "";
  const selectedBeat = useMemo(() => stage06?.sections.find((section) => section.beatId === effectiveBeatId) ?? null, [effectiveBeatId, stage06]);
  const effectiveBeatNarration = revisedBeatNarration || selectedBeat?.narration || "";
  const hasSubstantiveDiff = decisionType === "D2"
    ? Boolean(stage06 && (effectiveTitle.trim() !== stage06.title || effectiveHook.trim() !== stage06.hook))
    : Boolean(selectedBeat && effectiveBeatNarration.trim() !== selectedBeat.narration);
  const canSubmit = workbench?.allowedActions.includes("APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION")
    && hasSubstantiveDiff && rationale.trim().length >= 20;
  const selectedToneId = toneCandidateId || stage07A?.candidates.find((candidate) => candidate.machineRecommended)?.candidateId || "";
  const canPrepareTone = workbench?.allowedActions.includes("PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT");
  const canSelectTone = workbench?.allowedActions.includes("SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE")
    && selectedToneId.length > 0 && rationale.trim().length >= 20;
  const canAdvanceVisualGrammar = workbench?.allowedActions.includes("ADVANCE_TRACK_G_VIDEO_1_STAGE_07B");
  const canAdvanceShotCueProgram = workbench?.allowedActions.includes("ADVANCE_TRACK_G_VIDEO_1_STAGE_08");
  const selectedThumbnailId = thumbnailCandidateId
    || stage09?.candidates.find((candidate) => candidate.machineRecommended)?.candidateId || "";
  const selectedThumbnail = stage09?.candidates.find((candidate) =>
    candidate.candidateId === selectedThumbnailId) ?? null;
  const effectiveThumbnailText = thumbnailText || selectedThumbnail?.thumbnailText || "";
  const canPrepareVisualReview = workbench?.allowedActions
    .includes("PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW");
  const canSelectThumbnail = workbench?.allowedActions
    .includes("SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL")
    && selectedThumbnailId.length > 0
    && effectiveThumbnailText.trim().length >= 6
    && effectiveThumbnailText.trim().length <= 48
    && rationale.trim().length >= 20;
  const canStartNarration = workbench?.allowedActions
    .includes("START_TRACK_G_VIDEO_1_STAGE_10");
  const canFinalizeNarration = workbench?.allowedActions
    .includes("FINALIZE_TRACK_G_VIDEO_1_STAGE_10");

  async function prepareChannel() {
    setBusy(true); setError("");
    try {
      const idempotencyKey = await sha256(`PREPARE_CHANNEL|HP-01|${objective.trim()}`);
      const response = await fetch("/api/operator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandType: "PREPARE_CHANNEL", objective, idempotencyKey }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Command failed");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function applyEditorialDecision() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandType: "APPLY_TRACK_G_VIDEO_1_STAGE_06_EDITORIAL_DECISION",
          confirm: true,
          decisionType,
          revisedTitle: decisionType === "D2" ? effectiveTitle : undefined,
          revisedHook: decisionType === "D2" ? effectiveHook : undefined,
          beatId: decisionType === "D4" ? effectiveBeatId : undefined,
          revisedBeatNarration: decisionType === "D4" ? effectiveBeatNarration : undefined,
          rationale,
        }),
      });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Editorial decision failed");
      setReceipt(body);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function prepareVoiceTournament() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_07A_VOICE_TOURNAMENT",
          confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Voice tournament preparation failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function selectTone() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_07A_TONE",
          confirm: true, candidateId: selectedToneId, rationale }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Tone selection failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function advanceVisualGrammar() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_07B", confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Visual grammar compilation failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function advanceShotCueProgram() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "ADVANCE_TRACK_G_VIDEO_1_STAGE_08", confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "ShotCueProgram compilation failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function prepareVisualReview() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "PREPARE_TRACK_G_VIDEO_1_STAGE_09_VISUAL_REVIEW",
          confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Stage 09 visual review preparation failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function selectThumbnail() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "SELECT_TRACK_G_VIDEO_1_STAGE_09_THUMBNAIL",
          confirm: true, candidateId: selectedThumbnailId,
          revisedThumbnailText: effectiveThumbnailText, rationale }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Stage 09 thumbnail decision failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function startNarration() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "START_TRACK_G_VIDEO_1_STAGE_10",
          confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Stage 10 durable job start failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function finalizeNarration() {
    setBusy(true); setError(""); setReceipt(null);
    try {
      const response = await fetch("/api/operator", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandType: "FINALIZE_TRACK_G_VIDEO_1_STAGE_10",
          confirm: true }) });
      const body = await response.json() as Receipt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Stage 10 durable receipt finalization failed");
      setReceipt(body); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (!snapshot?.channel) {
    return <div className="operator-layout">
      <section className="operator-command-card operator-full-card">
        <div className="operator-card-heading"><div><p className="eyebrow">OWNER COMMAND</p><h2>Prepare the approved channel</h2></div><span className="write-badge">D1 WRITE</span></div>
        <p className="operator-help">This creates the approved channel contract and queue. Provider dispatch and publishing remain disabled.</p>
        <label htmlFor="objective">Operational objective</label>
        <textarea id="objective" value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} maxLength={500} />
        <button type="button" onClick={prepareChannel} disabled={busy || objective.trim().length < 12}>{busy ? "Executing…" : "Run PREPARE_CHANNEL"}</button>
        {error ? <p className="operator-error" role="alert">{error}</p> : null}
      </section>
    </div>;
  }

  return <div className="operator-layout">
    <section className="operator-state-card operator-workbench-card">
      <div className="operator-card-heading"><div><p className="eyebrow">ACTIVE PRODUCTION RUN</p><h2>Track G Video #1</h2></div><span className="state-badge ready">{workbench?.run.status ?? "LOADING"}</span></div>
      <dl className="operator-state-list">
        <div><dt>Current step</dt><dd>{workbench?.run.currentStep ?? "—"}</dd></div>
        <div><dt>Package</dt><dd>{workbench?.productionPackage.id ?? "—"}</dd></div>
        <div><dt>Profile</dt><dd>{workbench ? `${workbench.contract.profile} · ${workbench.contract.assuranceMode}` : "—"}</dd></div>
        <div><dt>Voice</dt><dd>{snapshot.voiceFingerprintState} · {snapshot.voiceBindingCount}/8</dd></div>
        <div><dt>Decisions</dt><dd>{workbench?.humanDecisionCount ?? 0} persisted</dd></div>
        <div><dt>Spend ceiling</dt><dd>${workbench?.productionPackage.spendCeilingUsd ?? 0}</dd></div>
      </dl>
    </section>

    <aside className="operator-blocker-card">
      <p className="eyebrow">NEXT VALID ACTION</p><h2>{canPrepareTone ? "Prepare two tone routes" : canSelectTone || stage07A?.reviewState === "AWAITING_HUMAN" ? "Choose Stage 07A tone" : canAdvanceVisualGrammar ? "Compile Stage 07B visual grammar" : canAdvanceShotCueProgram ? "Compile Stage 08 ShotCueProgram" : canPrepareVisualReview ? "Prepare Stage 09 visual review" : canSelectThumbnail || stage09?.reviewState === "AWAITING_HUMAN" ? "Choose and edit Stage 09 thumbnail" : canStartNarration ? "Start durable Stage 10 job" : canFinalizeNarration ? "Finalize Stage 10 receipt" : stage10Job?.state === "PENDING" ? "Stage 10 worker is running" : workbench?.allowedActions.length ? "Owner editorial decision" : "No action available"}</h2>
      <ul>{snapshot.activationBlockers.map((blocker) => <li key={blocker}>{blocker.replaceAll("_", " ")}</li>)}</ul>
      <p>Provider dispatch {workbench?.contract.providerDispatch ?? "OFF"} · release {workbench?.contract.releaseEligible ? "eligible" : "blocked"} · auto-publish {workbench?.contract.autoPublish ?? "OFF"}</p>
    </aside>

    {workbench?.run.currentStep === "STAGE_06_READY" ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">HP-02 · OWNER REVIEW</p><h2>Stage 06 editorial review</h2></div><span className="write-badge">D2 / D4</span></div>
      {stage06 ? <>
        <div className="script-metadata"><div><span>Draft title</span><strong>{stage06.title}</strong></div><div><span>Hook</span><strong>{stage06.hook}</strong></div><div><span>Script</span><strong>{stage06.wordCount} words · {stage06.estimatedDurationSec}s</strong></div><div><span>Evidence</span><code>{stage06.draftSha256.slice(0, 16)}…</code></div></div>
        <div className="gate-strip">{stage06.gateResults.map((gate) => <span key={gate.gate} className={gate.state === "PASS" ? "pass" : "waiting"}>{gate.gate.replaceAll("_", " ")} · {gate.state}</span>)}</div>
        <ol className="beat-list">{stage06.sections.map((section) => <li key={section.beatId}><div><span>{section.beatId}</span><strong>{section.title}</strong></div><p>{section.narration}</p><small>{section.claimIds.length ? `Claims: ${section.claimIds.join(", ")}` : "No external claim"}</small></li>)}</ol>
        <div className="editorial-form">
          <fieldset><legend>Choose one substantive decision</legend>
            <label><input type="radio" checked={decisionType === "D2"} onChange={() => setDecisionType("D2")} /> D2 · Revise title and/or hook</label>
            <label><input type="radio" checked={decisionType === "D4"} onChange={() => setDecisionType("D4")} /> D4 · Rewrite one beat</label>
          </fieldset>
          {decisionType === "D2" ? <div className="editorial-grid"><label>Revised title<input value={effectiveTitle} onChange={(event) => setRevisedTitle(event.target.value)} /></label><label>Revised hook<textarea rows={4} value={effectiveHook} onChange={(event) => setRevisedHook(event.target.value)} /></label></div>
            : <div className="editorial-grid"><label>Beat<select value={effectiveBeatId} onChange={(event) => { setBeatId(event.target.value); setRevisedBeatNarration(""); }}>{stage06.sections.map((section) => <option key={section.beatId} value={section.beatId}>{section.beatId} · {section.title}</option>)}</select></label><label>Revised narration<textarea rows={6} value={effectiveBeatNarration} onChange={(event) => setRevisedBeatNarration(event.target.value)} /></label></div>}
          <label className="rationale-field">Rationale (minimum 20 characters)<textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
          <button type="button" disabled={busy || !canSubmit} onClick={applyEditorialDecision}>{busy ? "Applying…" : "Apply owner decision and freeze Stage 06"}</button>
          <p className="operator-boundary">A substantive diff is mandatory. The same domain executor, idempotency rule, D1 write and R2 evidence are used by MCP and this surface.</p>
        </div>
      </> : <p className="operator-empty">Stage 06 draft has not been prepared.</p>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt?.artifactSha256 ? <p className="decision-receipt" role="status">Accepted {receipt.decisionType} · Stage 06 {receipt.stageState} · next {receipt.currentStep} · evidence {receipt.artifactSha256.slice(0, 16)}…</p> : null}
    </section> : null}

    {workbench?.run.currentStep === "STAGE_07A_READY" || stage07A ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">HP-02 · OWNER REVIEW</p><h2>Stage 07A voice tone and TTS segmentation</h2></div><span className="write-badge">D5</span></div>
      {!stage07A ? <>
        <p className="operator-help">Prepare two bounded tone routes using the qualified voice. This validates six beat-aligned TTS segments and the existing voice-settings hash; it does not call the provider.</p>
        <button type="button" disabled={busy || !canPrepareTone} onClick={prepareVoiceTournament}>{busy ? "Preparing…" : "Prepare two voice routes"}</button>
      </> : <>
        <div className="script-metadata"><div><span>Qualified settings</span><code>{stage07A.settingsHash.slice(0, 16)}…</code></div><div><span>Segmentation</span><strong>{stage07A.segmentCount} sealed beat boundaries</strong></div></div>
        <div className="gate-strip">{stage07A.gateResults.map((gate) => <span key={gate.gate} className={gate.state === "PASS" ? "pass" : "waiting"}>{gate.gate.replaceAll("_", " ")} · {gate.state}</span>)}</div>
        <div className="route-grid">{stage07A.candidates.map((candidate) => <article key={candidate.candidateId} className={candidate.selected ? "selected" : ""}>
          <label><input type="radio" name="tone" checked={selectedToneId === candidate.candidateId} onChange={() => setToneCandidateId(candidate.candidateId)} disabled={stage07A.reviewState !== "AWAITING_HUMAN"} /> {candidate.machineRecommended ? "RECOMMENDED" : "ALTERNATIVE"}</label>
          <strong>{candidate.routeName}</strong><p>{candidate.summary}</p><p>{candidate.deliveryDirection}</p>
          <small>Score {candidate.machineScore} · sentence pause {candidate.pauseProfile.sentenceMs}ms · beat pause {candidate.pauseProfile.beatMs}ms</small>
        </article>)}</div>
        {stage07A.reviewState === "AWAITING_HUMAN" ? <div className="editorial-form">
          <label className="rationale-field">Why this tone fits the audience (minimum 20 characters)<textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
          <button type="button" disabled={busy || !canSelectTone} onClick={selectTone}>{busy ? "Applying…" : "Select tone and freeze Stage 07A"}</button>
          <p className="operator-boundary">The rejected route remains sealed. Provider dispatch, release and auto-publish stay OFF.</p>
        </div> : stage07A.decision ? <p className="decision-rationale">D5 accepted: {stage07A.decision.rationale}</p> : null}
      </>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt ? <p className="decision-receipt" role="status">Stage 07A {receipt.stageState} · next {receipt.currentStep}{receipt.artifactSha256 ? ` · evidence ${receipt.artifactSha256.slice(0, 16)}…` : " · awaiting D5"}</p> : null}
    </section> : null}

    {workbench?.run.currentStep === "STAGE_07B_READY" || stage07B?.controlState === "FROZEN" ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">DESIGN LAYER · DETERMINISTIC</p><h2>Stage 07B visual grammar and routing</h2></div><span className="write-badge">M1 × 2</span></div>
      {stage07B ? <>
        <div className="script-metadata"><div><span>Closed motion taxonomy</span><strong>{stage07B.motionClasses.length} disjoint classes</strong></div><div><span>Beat coverage</span><strong>{stage07B.assignments.length}/{stage07B.assignments.length} routed</strong></div><div><span>Provider use</span><strong>Planning only · $0</strong></div><div><span>State</span><strong>{stage07B.controlState}</strong></div></div>
        <div className="gate-strip">{stage07B.gateResults.map((gate) => <span key={gate.gate} className={gate.state === "PASS" ? "pass" : "waiting"}>{gate.gate.replaceAll("_", " ")} · {gate.state}</span>)}</div>
        <ol className="beat-list">{stage07B.assignments.map((assignment) => <li key={assignment.beatId}><div><span>{assignment.beatId}</span><strong>{assignment.beatTitle}</strong></div><p>{assignment.treatment}</p><small>{assignment.motionClass.replaceAll("_", " ")} · {assignment.visualRoute.replaceAll("_", " ")} · {assignment.startSec}–{assignment.endSec}s</small></li>)}</ol>
        {stage07B.controlState !== "FROZEN" ? <>
          <button type="button" disabled={busy || !canAdvanceVisualGrammar} onClick={advanceVisualGrammar}>{busy ? "Compiling…" : "Compile, seal and freeze Stage 07B"}</button>
          <p className="operator-boundary">This freezes deterministic routing only. No footage, image, TTS or paid provider request is dispatched.</p>
        </> : <p className="decision-rationale">Visual grammar sealed. Stage 08 can now compile the ShotCueProgram.</p>}
      </> : <p className="operator-empty">Stage 07B routing model is unavailable.</p>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt?.artifactSha256 && receipt.currentStep === "STAGE_08_READY" ? <p className="decision-receipt" role="status">Stage 07B {receipt.stageState} · next {receipt.currentStep} · evidence {receipt.artifactSha256.slice(0, 16)}…</p> : null}
    </section> : null}

    {workbench?.run.currentStep === "STAGE_08_READY" || stage08?.controlState === "FROZEN" ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">COMPILER · FRAME-EXACT</p><h2>Stage 08 ShotCueProgram</h2></div><span className="write-badge">M1 × 2</span></div>
      {stage08 ? <>
        <div className="script-metadata"><div><span>Adaptive shots</span><strong>{stage08.shots.length} · no fixed-count gate</strong></div><div><span>Timeline</span><strong>{stage08.targetFrames} frames · {stage08.targetDurationSec}s</strong></div><div><span>Assertions</span><strong>{stage08.assertionCount} · three per shot</strong></div><div><span>Provider use</span><strong>Compiler only · $0</strong></div></div>
        <div className="gate-strip">{stage08.gateResults.map((gate) => <span key={gate.gate} className={gate.state === "PASS" ? "pass" : "waiting"}>{gate.gate.replaceAll("_", " ")} · {gate.state}</span>)}</div>
        <ol className="beat-list">{stage08.shots.map((shot) => <li key={shot.shotId}><div><span>{shot.shotId}</span><strong>{shot.beatTitle} · {shot.cueRole}</strong></div><p>{shot.treatment}</p><small>{shot.motionClass.replaceAll("_", " ")} · {shot.visualRoute.replaceAll("_", " ")} · frames {shot.startFrame}–{shot.endFrame}</small></li>)}</ol>
        {stage08.controlState !== "FROZEN" ? <>
          <button type="button" disabled={busy || !canAdvanceShotCueProgram} onClick={advanceShotCueProgram}>{busy ? "Compiling…" : "Compile, seal and freeze Stage 08"}</button>
          <p className="operator-boundary">The compiler derives shot count from beat duration, proves zero gap/overlap and binds exactly three assertions to every shot. No media is acquired.</p>
        </> : <p className="decision-rationale">ShotCueProgram sealed. Stage 09 may begin bounded visual acquisition.</p>}
      </> : <p className="operator-empty">Stage 08 compiler model is unavailable.</p>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt?.artifactSha256 && receipt.currentStep === "STAGE_09_READY" ? <p className="decision-receipt" role="status">Stage 08 {receipt.stageState} · next {receipt.currentStep} · evidence {receipt.artifactSha256.slice(0, 16)}…</p> : null}
    </section> : null}

    {workbench?.run.currentStep === "STAGE_09_READY" || stage09?.controlState === "FROZEN" ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">HP-02 · OWNER REVIEW</p><h2>Stage 09 visual acquisition and thumbnail</h2></div><span className="write-badge">D3</span></div>
      {stage09?.reviewState === "NOT_PREPARED" ? <>
        <p className="operator-help">Prepare one original vector composition per sealed shot and two bounded thumbnail routes. Rights, semantic-fit and duplicate-rate gates run before review; no stock or compositor provider is called.</p>
        <button type="button" disabled={busy || !canPrepareVisualReview} onClick={prepareVisualReview}>{busy ? "Preparing…" : "Prepare visual review"}</button>
        <p className="operator-boundary">PROFILE=REDUCED keeps six source candidates and one composition per shot. Provider dispatch and spend remain zero.</p>
      </> : stage09 ? <>
        <div className="script-metadata"><div><span>Visual coverage</span><strong>{stage09.assetCount} compositions · one per shot</strong></div><div><span>Candidate width</span><strong>{stage09.sourceCandidatesPerShot} sources → {stage09.compositionsPerShot} selected</strong></div><div><span>Duplicate rate</span><strong>{(stage09.duplicateRate * 100).toFixed(1)}%</strong></div><div><span>Rights mode</span><strong>Owner-controlled original vector</strong></div></div>
        <div className="gate-strip">{stage09.gateResults.map((gate) => <span key={gate.gate} className={gate.state === "PASS" ? "pass" : "waiting"}>{gate.gate.replaceAll("_", " ")} · {gate.state}</span>)}</div>
        <div className="route-grid">{stage09.candidates.map((candidate) => <article key={candidate.candidateId} className={candidate.selected ? "selected" : ""}>
          <label><input type="radio" name="thumbnail" checked={selectedThumbnailId === candidate.candidateId} onChange={() => { setThumbnailCandidateId(candidate.candidateId); setThumbnailText(candidate.thumbnailText); }} disabled={stage09.reviewState !== "AWAITING_HUMAN"} /> {candidate.machineRecommended ? "RECOMMENDED" : "ALTERNATIVE"}</label>
          <div aria-hidden="true" style={{ background: candidate.palette.background, color: candidate.palette.accent, borderLeft: `8px solid ${candidate.palette.signal}`, minHeight: 92, padding: 16, display: "grid", alignContent: "center" }}><strong>{candidate.thumbnailText}</strong></div>
          <strong>{candidate.routeName}</strong><p>{candidate.composition}</p><small>Score {candidate.machineScore}</small>
        </article>)}</div>
        {stage09.reviewState === "AWAITING_HUMAN" ? <div className="editorial-form">
          <label>Thumbnail text (6–48 characters)<input value={effectiveThumbnailText} onChange={(event) => setThumbnailText(event.target.value)} minLength={6} maxLength={48} /></label>
          <label className="rationale-field">Why this thumbnail earns attention without breaking trust (minimum 20 characters)<textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
          <button type="button" disabled={busy || !canSelectThumbnail} onClick={selectThumbnail}>{busy ? "Applying…" : "Apply D3 and freeze Stage 09"}</button>
          <p className="operator-boundary">The rejected route remains sealed. No provider dispatch, release or publication is authorized.</p>
        </div> : stage09.decision ? <p className="decision-rationale">D3 accepted: {stage09.decision.rationale}</p> : null}
      </> : <p className="operator-empty">Stage 09 visual model is unavailable.</p>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt ? <p className="decision-receipt" role="status">Stage 09 {receipt.stageState} · next {receipt.currentStep}{receipt.artifactSha256 ? ` · evidence ${receipt.artifactSha256.slice(0, 16)}…` : " · awaiting D3"}</p> : null}
    </section> : null}

    {workbench?.run.currentStep === "STAGE_10_READY" || stage10?.controlState === "FROZEN" ? <section className="operator-command-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">PRODUCTION MEDIA · BOUNDED</p><h2>Stage 10 calibrated narration tournament</h2></div><span className="write-badge">M1 × 2</span></div>
      {!stage10 ? <>
        <p className="operator-help">Create two real ElevenLabs takes for each of the six sealed beats, measure every take with the independently calibrated WhisperX observer, select one eligible take per beat, and seal the joined narration.</p>
        <div className="script-metadata"><div><span>Maximum provider calls</span><strong>12 · no retry</strong></div><div><span>Stage reservation</span><strong>$4.00 maximum</strong></div><div><span>Required gates</span><strong>Phoneme mismatch + seam score</strong></div><div><span>Publishing</span><strong>Release OFF · auto-publish OFF</strong></div></div>
        {!stage10Job ? <button type="button" disabled={busy || !canStartNarration} onClick={startNarration}>{busy ? "Starting…" : "Start durable Stage 10 job"}</button> : null}
        {stage10Job?.state === "PENDING" ? <p className="decision-receipt" role="status">Stage 10 job PENDING · the worker is producing and measuring asynchronously · refresh to read the durable receipt.</p> : null}
        {stage10Job?.state === "READY" ? <button type="button" disabled={busy || !canFinalizeNarration} onClick={finalizeNarration}>{busy ? "Verifying receipt…" : "Verify receipt and freeze Stage 10"}</button> : null}
        {stage10Job?.state === "FAILED" ? <p className="operator-error" role="alert">Stage 10 job failed closed: {stage10Job.errorCode}</p> : null}
        <p className="operator-boundary">The start command returns quickly and may incur bounded TTS spend. Only the separate finalize command can verify immutable R2 receipt bytes, seal Stage 10 and advance to Stage 11.</p>
      </> : <>
        <div className="script-metadata"><div><span>Provider calls</span><strong>{stage10.providerCallCount}</strong></div><div><span>Spend</span><strong>${stage10.actualUsd.toFixed(4)} / ${stage10.reservedUsd.toFixed(2)} reserved</strong></div><div><span>Calibration</span><code>{stage10.calibrationEvidenceSha256.slice(0, 18)}…</code></div><div><span>Narration</span><code>{stage10.narrationSha256.slice(0, 16)}…</code></div></div>
        <div className="gate-strip"><span className="pass">M1 PHONEME MISMATCH · PASS</span><span className="pass">M1 SEAM SCORE · PASS</span></div>
        <p className="decision-rationale">Stage 10 is sealed. Rejected take evidence is preserved and the run is ready for Stage 11.</p>
      </>}
      {error ? <p className="operator-error" role="alert">{error}</p> : null}
      {receipt?.artifactSha256 && receipt.currentStep === "STAGE_11_READY" ? <p className="decision-receipt" role="status">Stage 10 {receipt.stageState} · next {receipt.currentStep} · {receipt.providerCallCount} calls · ${receipt.stageActualUsd?.toFixed(4)} actual · evidence {receipt.artifactSha256.slice(0, 16)}…</p> : null}
    </section> : null}

    <section className="operator-timeline-card operator-full-card">
      <div className="operator-card-heading"><div><p className="eyebrow">CONTROL STATE</p><h2>Video #1 production timeline</h2></div><span className="verified-badge">STAGE 00–14</span></div>
      <div className="stage-grid">{workbench?.stages.map((stage) => <article key={stage.stageCode} className={`stage-${stage.controlState.toLowerCase()}`}><span>{stage.stageCode}</span><strong>{stage.controlState}</strong><small>{stage.artifact?.artifactType ?? (stage.controlState === "RUNNING" ? "Awaiting owner decision" : stage.controlState === "READY" ? "Ready for next action" : "Awaiting executor")}</small></article>)}</div>
    </section>

    <section className="operator-timeline-card">
      <div className="operator-card-heading"><div><p className="eyebrow">DECISION HISTORY</p><h2>Stage 04 creative tournament</h2></div></div>
      <div className="route-grid">{workbench?.stage04?.candidates.map((candidate) => <article key={candidate.candidateId} className={candidate.selected ? "selected" : ""}><span>{candidate.selected ? "CHAMPION" : "ROUTE"}</span><strong>{candidate.routeName}</strong><p>{candidate.primaryTitle}</p><small>{candidate.narrativeDevice} · score {candidate.aggregateScore}</small></article>)}</div>
      {workbench?.stage04?.decision ? <p className="decision-rationale">{workbench.stage04.decision.rationale}</p> : null}
    </section>

    <section className="operator-timeline-card">
      <div className="operator-card-heading"><div><p className="eyebrow">APPEND-ONLY RECEIPT</p><h2>Active run events</h2></div><span className="verified-badge">{snapshot.latestRunEvents.length} EVENTS</span></div>
      <ol className="event-timeline">{snapshot.latestRunEvents.map((event) => <li key={event.id}><span>{String(event.ordinal).padStart(2, "0")}</span><div><strong>{event.eventType}</strong><small>{event.createdAt}</small></div></li>)}</ol>
    </section>

    <section className="operator-deliverables-card">
      <div className="operator-card-heading"><div><p className="eyebrow">PERSISTED DELIVERABLES</p><h2>Production episode queue</h2></div><span className="verified-badge">{snapshot.episodes.length} D1 ROWS</span></div>
      <ol className="operator-episode-list">{snapshot.episodes.map((episode) => <li key={episode.id}><span>{String(episode.sequence).padStart(2, "0")}</span><strong>{episode.title}</strong><small>{episode.status}</small></li>)}</ol>
    </section>
  </div>;
}
