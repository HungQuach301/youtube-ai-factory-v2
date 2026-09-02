import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { channels, ownerIdentity } from "../db/schema";
import { approvedChannel } from "./factory-contract";
import { getFactoryEnv } from "./runtime-env";

export type RuntimeReadiness = {
  d1: "PASS" | "BLOCKED";
  owner: "PASS" | "BLOCKED";
  channel: "PREPARED" | "NOT_PREPARED";
  detail: string;
};

export async function getRuntimeReadiness(): Promise<RuntimeReadiness> {
  try {
    const db = getDb();
    const configuredOwner = getFactoryEnv().FACTORY_OWNER_EMAIL?.trim().toLowerCase();
    const [actor] = configuredOwner
      ? await db.select({ identity: ownerIdentity.identity })
        .from(ownerIdentity)
        .where(eq(ownerIdentity.identity, configuredOwner))
        .limit(1)
      : [];
    const [channel] = await db.select({ status: channels.status })
      .from(channels)
      .where(eq(channels.id, approvedChannel.id))
      .limit(1);
    return {
      d1: "PASS",
      owner: actor ? "PASS" : "BLOCKED",
      channel: channel?.status === "PREPARED" || channel?.status === "ACTIVE" ? "PREPARED" : "NOT_PREPARED",
      detail: channel
        ? `D1 is live; ${channel.status.toLowerCase()} channel state was read back from Production.`
        : "D1 is live; the owner must issue PREPARE_CHANNEL to persist the approved strategy.",
    };
  } catch {
    return {
      d1: "BLOCKED",
      owner: "BLOCKED",
      channel: "NOT_PREPARED",
      detail: "Production D1 or its operational schema is unavailable.",
    };
  }
}
