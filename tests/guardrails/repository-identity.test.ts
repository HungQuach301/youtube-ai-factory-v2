import { describe, expect, it } from "vitest";
import {
  EXPECTED_REPOSITORY,
  assertRepositoryIdentities,
  normalizeRepositoryIdentity,
  resolveRepositoryIdentities,
} from "../../tools/verify-repository-identity.mjs";

describe("repository identity guard", () => {
  it("normalizes supported GitHub remote forms", () => {
    expect(normalizeRepositoryIdentity("https://github.com/HungQuach301/youtube-ai-factory-v2.git"))
      .toBe(EXPECTED_REPOSITORY);
    expect(normalizeRepositoryIdentity("git@github.com:HungQuach301/youtube-ai-factory-v2.git"))
      .toBe(EXPECTED_REPOSITORY);
  });

  it("accepts only the exact V2 repository", () => {
    expect(assertRepositoryIdentities([EXPECTED_REPOSITORY])).toBe(EXPECTED_REPOSITORY);
  });

  it("fails closed for the excluded repository", () => {
    expect(() => assertRepositoryIdentities(["HungQuach301/youtube-ai-factory"]))
      .toThrow(/REPOSITORY_IDENTITY_BLOCKED/);
  });

  it("fails closed when canonical and excluded remotes coexist", () => {
    expect(() =>
      assertRepositoryIdentities([
        EXPECTED_REPOSITORY,
        "HungQuach301/youtube-ai-factory",
      ]),
    ).toThrow(/REPOSITORY_IDENTITY_BLOCKED/);
  });

  it("uses the GitHub Actions repository identity when present", () => {
    expect(resolveRepositoryIdentities({ GITHUB_REPOSITORY: EXPECTED_REPOSITORY }))
      .toEqual([EXPECTED_REPOSITORY]);
  });

  it("fails closed when identity cannot be resolved", () => {
    expect(() => assertRepositoryIdentities(["UNKNOWN"]))
      .toThrow(/REPOSITORY_IDENTITY_BLOCKED/);
  });
});
