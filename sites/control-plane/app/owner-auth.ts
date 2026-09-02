import type { ChatGPTUser } from "./chatgpt-auth";
import { getFactoryEnv } from "./runtime-env";

export function requireOwner(user: ChatGPTUser): void {
  const configuredOwner = getFactoryEnv().FACTORY_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) throw new Error("FACTORY_OWNER_ALLOWLIST_UNCONFIGURED");
  if (user.email.trim().toLowerCase() !== configuredOwner) {
    throw new Error("FACTORY_OWNER_AUTHORIZATION_DENIED");
  }
}
