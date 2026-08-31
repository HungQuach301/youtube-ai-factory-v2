import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { requireOwner } from "../operator-runtime";
import OperatorClient from "./operator-client";

export const dynamic = "force-dynamic";

export default async function OperatePage() {
  const user = await requireChatGPTUser("/operate");
  requireOwner(user);
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="YouTube AI Factory V2 home">
          <span className="brand-mark" aria-hidden="true">YF</span>
          <span><strong>YouTube AI Factory</strong><small>V2 · Production Operator</small></span>
        </Link>
        <div className="topbar-actions"><span className="mode-pill"><i /> OPERATE · TRACK G</span><Link className="repo-link" href="/">Control plane</Link></div>
      </header>
      <section className="operator-shell">
        <div className="operator-title-row">
          <div><p className="eyebrow">PRODUCTION WORKING SURFACE</p><h1>Review the work.<br />Advance with evidence.</h1></div>
          <p>Track G workbench projects the active D1/R2 state, required owner decisions and full production timeline. UI and MCP invoke the same guarded domain executors.</p>
        </div>
        <OperatorClient />
      </section>
    </main>
  );
}
