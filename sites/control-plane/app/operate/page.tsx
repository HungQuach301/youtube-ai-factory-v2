import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import OperatorClient from "./operator-client";

export const dynamic = "force-dynamic";

export default async function OperatePage() {
  await requireChatGPTUser("/operate");
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="YouTube AI Factory V2 home">
          <span className="brand-mark" aria-hidden="true">YF</span>
          <span><strong>YouTube AI Factory</strong><small>V2 · Production Operator</small></span>
        </Link>
        <div className="topbar-actions"><span className="mode-pill"><i /> OPERATE · G-01A2</span><Link className="repo-link" href="/">Control plane</Link></div>
      </header>
      <section className="operator-shell">
        <div className="operator-title-row">
          <div><p className="eyebrow">PRODUCTION WORKING SURFACE</p><h1>Command the factory.<br />Verify the state.</h1></div>
          <p>Authenticated commands from this surface or the ChatGPT MCP connection write to the same Production D1 and return an append-only receipt. No code change is required for an operational run.</p>
        </div>
        <OperatorClient />
      </section>
    </main>
  );
}
