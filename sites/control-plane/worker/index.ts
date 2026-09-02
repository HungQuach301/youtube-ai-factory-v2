/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runWithFactoryEnv, type FactoryRuntimeEnv } from "../app/runtime-env";

interface Env extends FactoryRuntimeEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type RootActor =
  | "anonymous"
  | "owner"
  | "authenticated-non-owner"
  | "platform-renderer"
  | "configuration-error";

type RootAuthorization = "allowed" | "deferred" | "denied" | "misconfigured";

type RootAuthorizationDecision = {
  actor: RootActor;
  authorization: RootAuthorization;
  failure?: Response;
};

const ROOT_ACTOR_HEADER = "x-factory-root-actor";
const ROOT_AUTHORIZATION_HEADER = "x-factory-root-authorization";

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const rootAuthorization = url.pathname === "/"
      ? authorizeOwnerPageRequest(request, env)
      : null;

    if (rootAuthorization?.failure) return rootAuthorization.failure;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await runWithFactoryEnv(env, () => handler.fetch(request, env, ctx));
    return rootAuthorization
      ? withRootAuthorizationEvidence(response, rootAuthorization)
      : response;
  },
};

function authorizeOwnerPageRequest(request: Request, env: Env): RootAuthorizationDecision {
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!authenticatedEmail) {
    return { actor: "anonymous", authorization: "deferred" };
  }

  const configuredOwner = env.FACTORY_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) {
    return authorizationFailure(
      "FACTORY_OWNER_ALLOWLIST_UNCONFIGURED",
      503,
      "configuration-error",
      "misconfigured",
    );
  }
  if (authenticatedEmail !== configuredOwner) {
    // The platform renderer marker is diagnostic only. It is evaluated after
    // owner mismatch and can never grant access.
    const actor = isPlatformRenderingRequest(request)
      ? "platform-renderer"
      : "authenticated-non-owner";
    return authorizationFailure(
      "FACTORY_OWNER_AUTHORIZATION_DENIED",
      403,
      actor,
      "denied",
    );
  }
  return { actor: "owner", authorization: "allowed" };
}

function authorizationFailure(
  body: string,
  status: number,
  actor: RootActor,
  authorization: RootAuthorization,
): RootAuthorizationDecision {
  return {
    actor,
    authorization,
    failure: new Response(body, {
      status,
      headers: rootAuthorizationHeaders(actor, authorization),
    }),
  };
}

function withRootAuthorizationEvidence(
  response: Response,
  decision: RootAuthorizationDecision,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of rootAuthorizationHeaders(
    decision.actor,
    decision.authorization,
  )) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rootAuthorizationHeaders(
  actor: RootActor,
  authorization: RootAuthorization,
): Headers {
  return new Headers({
    "cache-control": "private, no-store",
    [ROOT_ACTOR_HEADER]: actor,
    [ROOT_AUTHORIZATION_HEADER]: authorization,
  });
}

function isPlatformRenderingRequest(request: Request): boolean {
  const signatureAgent = request.headers.get("signature-agent")?.trim().toLowerCase();
  return Boolean(
    signatureAgent?.startsWith("https://web-bot-auth.cloudflare-browser-rendering-")
      && signatureAgent.endsWith(".workers.dev"),
  );
}

export default worker;
