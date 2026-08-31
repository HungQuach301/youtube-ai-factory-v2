import { eq } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { stage10MediaJobs } from "../../../../db/schema";
import {
  putImmutableProductionEvidence,
  sha256,
  verifyImmutableEvidence,
} from "../../../evidence-storage";
import { validateStage10MediaResult, type Stage10MediaResult } from "../../../stage10-media";
import { canonicalize } from "../../../track-g-video-one";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!/^[a-f0-9]{64}$/u.test(token)) {
    return Response.json({ error: "STAGE_10_CALLBACK_UNAUTHORIZED" }, { status: 401 });
  }
  const body = await request.json() as {
    idempotencyKey?: string;
    result?: Stage10MediaResult;
  };
  if (!/^[a-f0-9]{64}$/u.test(body.idempotencyKey ?? "") || !body.result) {
    return Response.json({ error: "STAGE_10_CALLBACK_INVALID" }, { status: 400 });
  }
  const db = getDb();
  const [job] = await db.select().from(stage10MediaJobs)
    .where(eq(stage10MediaJobs.providerIdempotencyKey, body.idempotencyKey!)).limit(1);
  if (!job || job.callbackTokenHash !== sha256(new TextEncoder().encode(token))) {
    return Response.json({ error: "STAGE_10_CALLBACK_UNAUTHORIZED" }, { status: 401 });
  }
  if (job.state === "READY" && job.receiptR2Key && job.receiptSha256
    && await verifyImmutableEvidence(job.receiptR2Key, job.receiptSha256)) {
    return Response.json({ accepted: true, replayed: true, jobStatus: "READY" });
  }
  if (job.state !== "PENDING") {
    return Response.json({ error: "STAGE_10_CALLBACK_STATE_CONFLICT" }, { status: 409 });
  }
  try {
    validateStage10MediaResult(body.result);
    const receiptBytes = new TextEncoder().encode(`${canonicalize({
      schemaVersion: 1,
      idempotencyKey: body.idempotencyKey,
      result: body.result,
    })}\n`);
    const receiptSha256 = sha256(receiptBytes);
    const receiptR2Key = [
      "prod", "channel_ai_era_money_defense_v1", "episode_ai_era_money_defense_001",
      "10", "worker-receipts", `${receiptSha256}.json`,
    ].join("/");
    await putImmutableProductionEvidence(
      receiptR2Key, receiptBytes, "application/json", receiptSha256,
    );
    const now = new Date().toISOString();
    const result = await getD1().prepare(`UPDATE stage10_media_job
      SET state = 'READY', receipt_r2_key = ?, receipt_sha256 = ?, worker_image_digest = ?,
          updated_at = ?
      WHERE id = ? AND state = 'PENDING'`).bind(
      receiptR2Key, receiptSha256, body.result.imageDigest, now, job.id,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error("STAGE_10_CALLBACK_CONCURRENT_STATE_CONFLICT");
    }
    return Response.json({ accepted: true, replayed: false, jobStatus: "READY" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAGE_10_CALLBACK_FAILED";
    await getD1().prepare(`UPDATE stage10_media_job SET state = 'FAILED', error_code = ?, updated_at = ?
      WHERE id = ? AND state = 'PENDING'`).bind(message, new Date().toISOString(), job.id).run();
    return Response.json({ error: message }, { status: 422 });
  }
}
