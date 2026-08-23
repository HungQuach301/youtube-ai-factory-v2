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
  { id: "WP-10", name: "Stage Runner Framework", status: "Blocked", detail: "Owner checkpoint required before WP-10 can open Phase 2 execution work." },
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
              <div><p className="eyebrow">CURRENT BUILD STATE</p><h2>Foundation complete · owner checkpoint active</h2></div>
              <span className="progress-label">10 / 33 work packages</span>
            </div>
            <div className="progress-track" aria-label="10 of 33 work packages complete"><span style={{ width: "30.30%" }} /></div>
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
              <strong>OWNER CHECKPOINT</strong>
              <p>Foundation WP-00 → WP-09 is complete. Owner approval is required before WP-10 or any Phase 2 execution work begins.</p>
            </div>
            <p className="safety-note">Provider transport, production spend and publishing remain fail-closed while this checkpoint is active.</p>
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
