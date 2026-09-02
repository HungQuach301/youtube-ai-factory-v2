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

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const authorizationFailure = authorizeOwnerPageRequest(request, env);
      if (authorizationFailure) return authorizationFailure;
    }

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

    return runWithFactoryEnv(env, () => handler.fetch(request, env, ctx));
  },
};

function authorizeOwnerPageRequest(request: Request, env: Env): Response | null {
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!authenticatedEmail) return null;

  const configuredOwner = env.FACTORY_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) {
    return new Response("FACTORY_OWNER_ALLOWLIST_UNCONFIGURED", { status: 503 });
  }
  if (authenticatedEmail !== configuredOwner) {
    return new Response("FACTORY_OWNER_AUTHORIZATION_DENIED", { status: 403 });
  }
  return null;
}

export default worker;
