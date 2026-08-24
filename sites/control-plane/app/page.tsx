import sourceLock from "../source-lock.json";

const repositoryUrl = "https://github.com/HungQuach301/youtube-ai-factory-v2";

const workPackages = [
  { id: "WP-00", name: "Scaffold & Contracts", status: "Complete", detail: "Contracts v2, strict TypeScript, guardrails and frozen CI install." },
  { id: "WP-01", name: "Canonical Hashing & Lineage", status: "Complete", detail: "Deterministic identity, streaming SHA-256 and fail-closed lineage." },
  { id: "WP-02", name: "Typed Command & State Machine", status: "Complete", detail: "Twelve commands, immutable transactions and concurrent idempotency." },
  { id: "WP-03", name: "Lease & Fencing", status: "Complete", detail: "Durable lease state, monotonic fencing and fail-closed reconciliation." },
  { id: "WP-04", name: "Definition of Ready Resolver", status: "Complete", detail: "Eleven evidence-derived readiness conditions with structured refusal." },
  { id: "WP-05", name: "Standard & Policy Registry", status: "Complete", detail: "Four-scope inheritance, G11 only-tighten policy and fail-closed gate controls." },
  { id: "WP-06", name: "Evidence Store", status: "Complete", detail: "Immutable source and provider snapshots with checksum replay and namespace isolation." },
  { id: "WP-07", name: "Provider Adapter Framework", status: "Complete", detail: "Guarded dispatch, seven-class error normalization, bounded retry and exact token-cost estimation." },
  { id: "WP-08", name: "Cost Reservation & Ledger", status: "Complete", detail: "Two-phase reservation, hierarchical ceilings, namespace isolation and orphan reconciliation are enforced fail-closed." },
  { id: "WP-09", name: "Capability Registry & Dispatch Guard", status: "Complete", detail: "Versioned qualified bindings, exact settings hashes and the nine-step fail-closed guard now protect every provider transport." },
  { id: "WP-10", name: "Stage Runner Framework", status: "Complete", detail: "The framework now owns the nine-step lifecycle, deterministic preflight, mandatory read-back and idempotent typed commands." },
  { id: "WP-11", name: "Tournament Engine", status: "Complete", detail: "Blind judge payloads, deterministic seeded selection, anchored rubrics, eligibility-first filtering and rejected-candidate evidence are enforced." },
  { id: "WP-12", name: "Media Worker Runtime", status: "Complete", detail: "Pinned CPU-only image, deterministic job plans, immutable read-back and the no-D1 worker boundary now pass CI." },
  { id: "WP-12B", name: "Cost Benchmark", status: "Complete", detail: "Owner confirmed the measured economic checkpoint and selected PROFILE=REDUCED for downstream work." },
  { id: "WP-13", name: "Deterministic Measurement", status: "Complete", detail: "All 15 MSR-01 measurements now use strict inputs, known-result tests and canonical evidence hashes." },
  { id: "WP-14", name: "Gold Set & Calibration", status: "Evidence", detail: "Harness and 16 deterministic synthetic defects are merged. PASS remains blocked until the set reaches 30 samples including 15 real rejected masters." },
  { id: "WP-15", name: "Aligner Calibration", status: "Evidence", detail: "Pinned calibration harness is merged. The phoneme gate remains warning-only until 10–15 real human-reader samples establish the error floor." },
  { id: "WP-16", name: "Truth Layer", status: "Complete", detail: "Source tiers, critical-claim enforcement, deterministic numeric parsing and bilingual advice lint now pass CI." },
  { id: "WP-17", name: "Intelligence & Anti-copy", status: "Complete", detail: "Audience jobs, freshness and four-dimensional anti-copy primitives are deterministic; differentiation remains measurement-only until calibrated." },
  { id: "WP-20", name: "ShotCueProgram Compiler", status: "Complete", detail: "Stage 08 now compiles exact full-duration timelines with interval-tree lint, three claim-bound assertions per shot and no fixed shot-count gate." },
  { id: "WP-21", name: "Media Layer", status: "Complete", detail: "Stage 09–13 now enforce pre-byte rights eligibility, render-once composition, stitched narration, two-pass audio, OTIO edit evidence and archival-parent masters in PROFILE=REDUCED." },
  { id: "WP-28", name: "Human Evidence", status: "Activation", detail: "Editorial Imprint, the 300-minute attention ceiling and reproducible evidence reports are merged; activation waits for an explicit real-human allowlist identity." },
  { id: "WP-29", name: "Policy Defense · Minimum", status: "Complete", detail: "PC1–PC8, disclosure default-on, incident freeze/unfreeze and policy-watch diff controls are enforced fail-closed." },
];

const controls = [
  ["GitHub main", "Only canonical source"],
  ["Pull request", "Required for every change"],
  ["CI + source lock", "Must pass before deployment"],
  ["Sites checkpoint", "Derived from approved source"],
];

export default function Home() {
  const fingerprint = sourceLock.aggregate_sha256.slice(0, 16);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="YouTube AI Factory V2 home">
          <span className="brand-mark" aria-hidden="true">YF</span>
          <span><strong>YouTube AI Factory</strong><small>V2 · Control Plane</small></span>
        </a>
        <div className="topbar-actions">
          <span className="mode-pill"><i /> BUILD</span>
          <a className="repo-link" href={repositoryUrl} target="_blank" rel="noreferrer">Open canonical repository</a>
        </div>
      </header>

      <section className="shell" id="overview">
        <div className="status-strip" role="status">
          <span className="status-icon" aria-hidden="true">✓</span>
          <div><strong>Single source of truth policy active</strong><p>GitHub <code>main</code> is authoritative. This Site is a read-only deployment mirror.</p></div>
          <span className="fingerprint">SOURCE {fingerprint}</span>
        </div>

        <div className="hero-grid">
          <section className="hero-card">
            <p className="eyebrow">FACTORY FOUNDATION</p>
            <h1>Build a factory that can survive any AI handoff.</h1>
            <p className="hero-copy">Research, production, measurement and improvement will evolve here, while identity, policy and human control remain fail-closed.</p>
            <div className="hero-actions">
              <a className="primary-action" href="#roadmap">View build state</a>
              <a className="secondary-action" href="#continuity">Review continuity contract</a>
            </div>
          </section>

          <aside className="authority-card" aria-label="Source authority">
            <div className="card-heading">
              <div><p className="eyebrow">SOURCE AUTHORITY</p><h2>Canonical and traceable</h2></div>
              <span className="verified-badge">LOCKED</span>
            </div>
            <dl className="authority-list">
              <div><dt>Repository</dt><dd>HungQuach301/youtube-ai-factory-v2</dd></div>
              <div><dt>Branch</dt><dd>main</dd></div>
              <div><dt>Site role</dt><dd>Deployment mirror</dd></div>
              <div><dt>Managed files</dt><dd>{sourceLock.files.length}</dd></div>
              <div><dt>Source fingerprint</dt><dd className="mono">{fingerprint}</dd></div>
            </dl>
            <p className="authority-note">Chat messages, temporary files and direct Site edits cannot become factory truth.</p>
          </aside>
        </div>

        <section className="metrics" aria-label="Architecture summary">
          <article><strong>48</strong><span>Target modules</span><small>including architecture addenda</small></article>
          <article><strong>18</strong><span>End-to-end stages</span><small>research to learning</small></article>
          <article><strong>2</strong><span>Execution tracks</span><small>Platform + Golden Path</small></article>
          <article><strong>7</strong><span>Human touchpoints</span><small>quality + policy control</small></article>
        </section>

        <section className="section-grid" id="roadmap">
          <div className="panel roadmap-panel">
            <div className="section-heading">
            <div><p className="eyebrow">CURRENT BUILD STATE</p><h2>Phase 3 · media specification implemented</h2></div>
              <span className="progress-label">20 evidence-ready · 23 implemented / 33</span>
            </div>
            <div className="progress-track" aria-label="20 of 33 work packages evidence-ready; 23 implemented"><span style={{ width: "60.61%" }} /></div>
            <div className="work-list">
              {workPackages.map((item) => (
                <article className="work-item" key={item.id}>
                  <span className={`work-state ${item.status.toLowerCase()}`} aria-hidden="true" />
                  <div className="work-copy"><p><b>{item.id}</b><span>{item.name}</span></p><small>{item.detail}</small></div>
                  <em className={item.status.toLowerCase()}>{item.status}</em>
                </article>
              ))}
            </div>
          </div>

          <aside className="panel safety-panel">
            <p className="eyebrow">SAFETY BOUNDARY</p><h2>Production remains locked</h2>
            <ul className="safety-list">
              <li><span>Provider dispatch</span><b>OFF</b></li>
              <li><span>Production spend</span><b>$0</b></li>
              <li><span>Automatic publishing</span><b>BLOCKED</b></li>
              <li><span>Legacy site mutation</span><b>PROHIBITED</b></li>
            </ul>
            <div className="foundation-boundary" role="note">
              <strong>CONTROLLED EXECUTION</strong>
              <p>WP-16, WP-17, WP-20, WP-21 and minimum WP-29 are evidence-ready. WP-14/15 await real calibration evidence; WP-28 awaits an explicit human allowlist identity. Production provider dispatch remains locked until activation evidence exists.</p>
            </div>
            <p className="safety-note">This progress update changes no production permission: provider transport, spend and publishing remain locked.</p>
          </aside>
        </section>

        <section className="continuity" id="continuity">
          <div className="section-heading">
            <div><p className="eyebrow">CONTINUITY CONTRACT</p><h2>One direction. No hidden state.</h2></div>
            <span className="contract-version">SSOT v1</span>
          </div>
          <div className="control-flow">
            {controls.map(([title, detail], index) => (
              <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{title}</strong><p>{detail}</p></div></article>
            ))}
          </div>
          <div className="handoff-note"><strong>Handoff rule</strong><p>Any future AI starts from GitHub <code>main</code>, verifies checksums and blockers, creates a branch, passes CI, merges, then deploys that approved source. It never reconstructs the factory from chat history.</p></div>
        </section>
      </section>

      <footer><span>YouTube AI Factory V2</span><span>GitHub-canonical · Human-controlled · Policy-first</span></footer>
    </main>
  );
}
