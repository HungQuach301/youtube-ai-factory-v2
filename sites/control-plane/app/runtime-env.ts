import { AsyncLocalStorage } from "node:async_hooks";

export type FactoryRuntimeEnv = {
  ASSETS: Fetcher;
  DB?: D1Database;
  BUCKET?: R2Bucket;
  FACTORY_OWNER_EMAIL?: string;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
};

const storageSymbol = Symbol.for("youtube-ai-factory-v2.runtime-env");
const runtimeGlobal = globalThis as typeof globalThis & {
  [storageSymbol]?: AsyncLocalStorage<FactoryRuntimeEnv>;
};
const runtimeEnvStorage = runtimeGlobal[storageSymbol] ??= new AsyncLocalStorage<FactoryRuntimeEnv>();

export function runWithFactoryEnv<T>(runtimeEnv: FactoryRuntimeEnv, operation: () => T): T {
  return runtimeEnvStorage.run(runtimeEnv, operation);
}

export function getFactoryEnv(): FactoryRuntimeEnv {
  const runtimeEnv = runtimeEnvStorage.getStore();
  if (!runtimeEnv) throw new Error("FACTORY_RUNTIME_ENV_UNAVAILABLE");
  return runtimeEnv;
}
