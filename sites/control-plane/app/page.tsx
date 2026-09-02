import Link from "next/link";
import sourceLock from "../source-lock.json";
import { requireChatGPTUser } from "./chatgpt-auth";
import { getRuntimeReadiness } from "./home-readiness";

const repositoryUrl = "https://github.com/HungQuach301/youtube-ai-factory-v2";

export const dynamic = "force-dynamic";

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
  { id: "WP-18", name: "Creative Layer", status: "Complete", detail: "Creative routes, story contracts, prediction sealing and claim-bound script controls now pass deterministic acceptance." },
  { id: "WP-19", name: "Design Layer", status: "Complete", detail: "Channel identity, voice inheritance, visual routing and ambience-only soundscape controls are sealed fail-closed." },
  { id: "WP-20", name: "ShotCueProgram Compiler", status: "Complete", detail: "Stage 08 now compiles exact full-duration timelines with interval-tree lint, three claim-bound assertions per shot and no fixed shot-count gate." },
  { id: "WP-21", name: "Media Layer", status: "Complete", detail: "Stage 09–13 now enforce pre-byte rights eligibility, render-once composition, stitched narration, two-pass audio, OTIO edit evidence and archival-parent masters in PROFILE=REDUCED." },
  { id: "WP-22", name: "Assurance Panel", status: "Evidence", detail: "MSR-02/MSR-03 now enforce blind PROFILE critics, M0/M1-before-M2, borderline median and variance requalification. HARD_GATE waits for 36 human anchors, a ready gold set and qualified critics." },
  { id: "WP-23", name: "Publishing", status: "Complete", detail: "Stage 15 now separates owner release/publish commands, binds P9 and PC1–PC8 before an explicit manifest, keeps auto-publish OFF and persists resumable upload evidence without enabling YouTube transport." },
  { id: "WP-24", name: "Learning & Stage 16", status: "Complete", detail: "Real-only Analytics ETL, retention MAE, beat-boundary error, calibrated model lineage and sample-gated owner promotion are implemented. Activation waits for 14–28 day production analytics evidence." },
  { id: "WP-25", name: "Observability & Operator UI", status: "Complete", detail: "Trace reconstruction now proves the complete provider, cost and output chain; minimum metrics, mandatory alerts and the five operator display controls are enforced fail-closed." },
  { id: "WP-26", name: "G11–G15 Enforcement", status: "Complete", detail: "Sealed threshold diffs, OPERATE protected paths, shadow-gated meta-change, append-only gold retirement and PC1–PC8 publishing checks are now enforced in CI and D1." },
  { id: "WP-27", name: "Evolution Pipeline", status: "Complete", detail: "Structural strictness audit, qualification shadow replay, five-part evidence bundles, exact owner-command promotion binding and one-key rollback are enforced fail-closed." },
  { id: "WP-28", name: "Human Evidence", status: "Activation", detail: "Editorial Imprint, the 300-minute attention ceiling and reproducible evidence reports are merged; activation waits for an explicit real-human allowlist identity." },
  { id: "WP-29", name: "Policy Defense · Minimum", status: "Complete", detail: "PC1–PC8, disclosure default-on, incident freeze/unfreeze and policy-watch diff controls are enforced fail-closed." },
  { id: "WP-30", name: "Failure Mining", status: "Complete", detail: "Rejected masters, escaped defects, repeated gate failures and quarantine clusters now feed only gold samples or tighten-only evolution proposals." },
  { id: "WP-31", name: "OPERATE Mode Harness", status: "Complete", detail: "Daily orphan, FAIL, spend and incident triage plus append-only OPS-LOG auditing now pass CI without automatic state writes." },
];

const staticTrackGChecks = [
  { label: "Required work packages", state: "PASS", detail: "WP-12B, WP-16, WP-17 and minimum WP-28/WP-29 are implemented." },
  { label: "Profile and cost controls", state: "PASS", detail: "PROFILE=REDUCED · $30/video · $350 Track G · disclosure ON · ambience only." },
  { label: "HP-01 niche decision", state: "PASS", detail: "AI-Era Money Defense was owner-approved on 2026-08-25 and sealed in the canonical V2 repository." },
  { label: "Voice and calibration evidence", state: "BLOCKED", detail: "Qualified voice fingerprint and real calibration evidence are absent." },
  { label: "Media runtime", state: "PASS", detail: "Fly.io Production is QUALIFIED/READY on the pinned digest; job dispatch remains safely OFF until the remaining activation gates pass." },
] as const;

const nicheCandidates = [
  { name: "AI-Era Money Defense", score: 90, status: "CHAMPION", detail: "Highest combined demand, differentiation, faceless fit and durable evidence potential." },
  { name: "Digital Credit & BNPL Decoder", score: 85, status: "RUNNER-UP", detail: "Strong monetization and visual fit; narrower topic ceiling and higher advice risk." },
  { name: "Cash-Flow Resilience Lab", score: 84, status: "RUNNER-UP", detail: "Evergreen household need, but crowded and harder to differentiate without advice." },
  { name: "AI Workflow ROI for Non-Tech Workers", score: 81, status: "ALTERNATE", detail: "Large demand and B2B value, offset by fast decay and intense tutorial competition." },
  { name: "AI Money-Management Tool Reviews", score: 77, status: "ALTERNATE", detail: "Good advertiser fit, but freshness cost and affiliate trust risk reduce durability." },
] as const;

const episodes = [
  "The Bank Fraud Alert That Sends Your Money to the Scammer",
  "Your Boss’s Voice Is Real. The Payment Request Isn’t",
  "The Wrong Number Text: Inside a 30-Day Scam Funnel",
  "Why Instant Payments Are So Hard to Reverse",
  "The AI Investment Ad That Never Existed",
  "From Data Breach to Perfect Impersonation",
  "The Fake Job That Turns You Into a Money Mule",
  "The Family Emergency Call and the Voice-Clone Trap",
  "The “Safe Account” Lie: How Bank Impersonation Hijacks Trust",
  "The 10-Minute Verification Routine Before Moving Money",
] as const;

const evidence = [
  {
    metric: "20% · $56B",
    label: "US household fraud exposure",
    detail: "20% experienced financial fraud or scams; estimated net non-card fraud loss was $56B in 2025.",
    source: "Federal Reserve",
    href: "https://www.federalreserve.gov/publications/2026-economic-well-being-of-us-households-in-2025-banking.htm",
  },
  {
    metric: "$16B · $3.5B",
    label: "Reported fraud and imposter loss",
    detail: "Reported fraud losses reached about $16B; imposter scams accounted for $3.5B in 2025.",
    source: "Federal Trade Commission",
    href: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
  },
  {
    metric: "68%",
    label: "AI-scam concern",
    detail: "68% of Americans expect increased AI use to make online scams and attacks more common.",
    source: "Pew Research Center",
    href: "https://www.pewresearch.org/internet/2025/07/31/online-scams-and-attacks-in-america-today/",
  },
] as const;

const controls = [
  ["GitHub main", "Only canonical source"],
  ["Pull request", "Required for every change"],
  ["CI + source lock", "Must pass before deployment"],
  ["Sites checkpoint", "Derived from approved source"],
];

export default async function Home() {
  await requireChatGPTUser("/");
  const fingerprint = sourceLock.aggregate_sha256.slice(0, 16);
  const runtime = await getRuntimeReadiness();
  const trackGChecks = [
    ...staticTrackGChecks,
    { label: "Production state store", state: runtime.d1, detail: runtime.detail },
    {
      label: "Authenticated owner identity",
      state: runtime.owner,
      detail: runtime.owner === "PASS"
        ? "A real owner identity was read back from Production D1."
        : "The owner must authenticate and issue the first Production command.",
    },
    {
      label: "Approved channel state",
      state: runtime.channel === "PREPARED" ? "PASS" : "BLOCKED",
      detail: runtime.channel === "PREPARED"
        ? "The approved channel contract and queue are persisted as PREPARED."
        : "PREPARE_CHANNEL has not completed in Production.",
    },
  ];
  const channelPersisted = runtime.channel === "PREPARED";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="YouTube AI Factory V2 home">
          <span className="brand-mark" aria-hidden="true">YF</span>
          <span><strong>YouTube AI Factory</strong><small>V2 · Control Plane</small></span>
        </a>
        <div className="topbar-actions">
          <span className="mode-pill"><i /> G-01 DECISION SEALED</span>
          <a className="repo-link" href={repositoryUrl} target="_blank" rel="noreferrer">Open canonical repository</a>
        </div>
      </header>

      <section className="shell" id="overview">
        <div className="status-strip" role="status">
          <span className="status-icon" aria-hidden="true">✓</span>
          <div><strong>Split authority policy active</strong><p>GitHub <code>main</code> governs source; Production D1 governs operational commands, runs and state.</p></div>
          <span className="fingerprint">SOURCE {fingerprint}</span>
        </div>

        <div className="hero-grid">
          <section className="hero-card">
            <p className="eyebrow">FACTORY FOUNDATION</p>
            <h1>Move from build-complete to evidence-backed activation.</h1>
            <p className="hero-copy">The factory foundation is implemented. Track G starts only when channel identity, human evidence and production state can be proven—not inferred.</p>
            <div className="hero-actions">
              <Link className="primary-action" href="/operate">Open Production Operator</Link>
              <a className="secondary-action" href="#g01-decision">View approved channel</a>
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
              <div><dt>Site role</dt><dd>Authenticated working surface</dd></div>
              <div><dt>Managed files</dt><dd>{sourceLock.files.length}</dd></div>
              <div><dt>Source fingerprint</dt><dd className="mono">{fingerprint}</dd></div>
            </dl>
            <p className="authority-note">A chat instruction becomes factory truth only after an authenticated typed command is persisted and read back from Production D1.</p>
          </aside>
        </div>

        <section className="metrics" aria-label="Architecture summary">
          <article><strong>48</strong><span>Target modules</span><small>including architecture addenda</small></article>
          <article><strong>18</strong><span>End-to-end stages</span><small>research to learning</small></article>
          <article><strong>2</strong><span>Execution tracks</span><small>Platform + Golden Path</small></article>
          <article><strong>7</strong><span>Human touchpoints</span><small>quality + policy control</small></article>
        </section>

        <section className="panel track-g-panel" id="g01-decision" aria-labelledby="track-g-title">
          <div className="section-heading">
            <div><p className="eyebrow">TRACK G · G-01</p><h2 id="track-g-title">HP-01 decision & channel strategy</h2></div>
            <span className="decision-badge">{channelPersisted ? "CHANNEL PREPARED · ACTIVATION BLOCKED" : "HP-01 SEALED · PREPARATION READY"}</span>
          </div>
          <p className="track-g-intro">The owner has selected a new niche for the US market. Strategy deliverables are canonical; production persistence remains fail-closed until real bindings and evidence exist.</p>

          <div className="decision-hero">
            <div>
              <span className="decision-stamp">OWNER APPROVED · 2026-08-25</span>
              <h3>AI-Era Money Defense</h3>
              <p>Evidence-led, faceless explainers showing how AI, social engineering and digital payment systems are used to take household money—and the verification habits that interrupt the loss—without personalized financial or investment advice.</p>
            </div>
            <dl>
              <div><dt>Market</dt><dd>United States · English (en-US)</dd></div>
              <div><dt>Audience</dt><dd>Adults 30–55 managing household money and supporting aging parents</dd></div>
              <div><dt>Format</dt><dd>Premium faceless documentary / explainer</dd></div>
              <div><dt>Viewer promise</dt><dd>“See the trap before it touches your money.”</dd></div>
            </dl>
          </div>

          <div className="readiness-grid">
            {trackGChecks.map((check) => (
              <article className={`readiness-item ${check.state === "PASS" ? "pass" : "blocked"}`} key={check.label}>
                <div><strong>{check.label}</strong><span>{check.state}</span></div>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
          <div className="activation-rule" role="note">
            <strong>Activation rule</strong>
            <p>PREPARED requires an authenticated owner command plus Production D1 read-back. ACTIVE still requires real voice, calibration and media-runtime evidence; no placeholder evidence may satisfy those gates.</p>
          </div>
        </section>

        <section className="g01-grid" aria-label="G-01 approved deliverables">
          <article className="panel ranking-panel">
            <div className="section-heading">
              <div><p className="eyebrow">NICHE DISCOVERY OUTCOME</p><h2>Evidence-weighted comparison</h2></div>
              <span className="verified-badge">5 CANDIDATES</span>
            </div>
            <p className="section-copy">Weighted across viewer attraction, competition, differentiation, monetization, faceless feasibility, expertise fit, evergreen potential and production cost.</p>
            <div className="candidate-list">
              {nicheCandidates.map((candidate, index) => (
                <div className={`candidate-row ${index === 0 ? "champion" : ""}`} key={candidate.name}>
                  <span className="candidate-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{candidate.name}</strong><p>{candidate.detail}</p></div>
                  <span className="candidate-status">{candidate.status}</span>
                  <b>{candidate.score}</b>
                </div>
              ))}
            </div>
          </article>

          <aside className="panel identity-panel">
            <div className="section-heading">
              <div><p className="eyebrow">CHANNEL IDENTITY CONTRACT v1</p><h2>Approved strategy source</h2></div>
            </div>
            <span className="persistence-badge">{channelPersisted ? "PRODUCTION D1 · PREPARED" : "APPROVED SOURCE · COMMAND PENDING"}</span>
            <dl className="identity-list">
              <div><dt>Positioning</dt><dd>Calm, evidence-first money defense—not scam-baiting entertainment</dd></div>
              <div><dt>Visual DNA</dt><dd>Transaction maps, scam funnels, timelines, annotated evidence and voice-clone comparisons</dd></div>
              <div><dt>Voice</dt><dd>Precise, investigative, respectful and never victim-shaming</dd></div>
              <div><dt>Safety</dt><dd>No personalized advice, no speculative claims and no reusable criminal instructions</dd></div>
              <div><dt>Controls</dt><dd>REDUCED · $30/video · $350 Track G · sampling OFF · freeze OFF · disclosure ON · ambience_only</dd></div>
            </dl>
            <p className="exclusion-note"><strong>Legacy exclusion</strong> Hidden Systems Behind Money is not imported into this V2 channel decision.</p>
          </aside>
        </section>

        <section className="panel evidence-panel" aria-labelledby="evidence-title">
          <div className="section-heading">
            <div><p className="eyebrow">MARKET & AUDIENCE EVIDENCE</p><h2 id="evidence-title">Why this niche can win</h2></div>
            <span className="verified-badge">PRIMARY SOURCES</span>
          </div>
          <div className="evidence-grid">
            {evidence.map((item) => (
              <article key={item.source}>
                <strong>{item.metric}</strong><span>{item.label}</span><p>{item.detail}</p>
                <a href={item.href} target="_blank" rel="noreferrer">{item.source} ↗</a>
              </article>
            ))}
          </div>
          <p className="conditions"><strong>Conditions to win</strong> Use primary-source claim graphs; begin with a familiar financial action; visualize the complete scam and payment flow; separate evergreen mechanism explainers from fast-decay news; preserve anti-copy controls; end with a durable verification mental model.</p>
        </section>

        <section className="panel queue-panel" aria-labelledby="queue-title">
          <div className="section-heading">
            <div><p className="eyebrow">FIRST PILLAR · APPROVED DELIVERABLE</p><h2 id="queue-title">How Modern Money Traps Work</h2></div>
            <span className="verified-badge">10 episodes queued</span>
          </div>
          <ol className="episode-grid">
            {episodes.map((episode, index) => (
              <li key={episode}><span>{String(index + 1).padStart(2, "0")}</span><strong>{episode}</strong></li>
            ))}
          </ol>
        </section>

        <section className="section-grid" id="roadmap">
          <div className="panel roadmap-panel">
            <div className="section-heading">
            <div><p className="eyebrow">CURRENT BUILD STATE</p><h2>Phase 5 complete · G-01 decision sealed</h2></div>
              <span className="progress-label">29 activation-ready · 33 implemented / 33</span>
            </div>
            <div className="progress-track" aria-label="29 of 33 work packages activation-ready; 33 implemented"><span style={{ width: "87.88%" }} /></div>
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
              <p>WP-00 through WP-31 are implemented, including WP-30 failure mining and the WP-31 OPERATE harness. WP-14/15 await real calibration evidence; WP-22 remains warning-only pending anchors, gold evidence and critic qualification; WP-24 activation awaits 14–28 day production Analytics and an owner-issued promotion command; WP-27 activation requires a real qualification shadow run, stored evidence bundle and exact owner-signed PROMOTE_EVOLUTION command. G-01A1 accepts only the authenticated PREPARE_CHANNEL command and persists its receipt in D1. YouTube transport and production provider dispatch remain locked until activation evidence exists.</p>
            </div>
            <div className="operator-proof" aria-label="WP-25 operator display contract">
              <div className="operator-proof-heading"><strong>OPS-02 DISPLAY CONTRACT</strong><span>IMPLEMENTED</span></div>
              <div className="gate-lanes"><span className="gate-fail">FAIL · measured failure</span><span className="gate-unknown">NOT_EVALUATED · not measured</span></div>
              <p className="fixture-label"><small>Required fixture label</small>QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE</p>
              <ul>
                <li>Unified human-touchpoint queue</li>
                <li>D1–D5 side-by-side desk + diff</li>
                <li>Structured rejection labeling</li>
                <li>Generate Evidence Report action</li>
                <li>Attention budget clock</li>
              </ul>
              <p>Any <code>trace_id</code> must reconstruct provider request/response, settled cost and sealed output before a successful stage attempt can close.</p>
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
