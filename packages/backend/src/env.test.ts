import { describe, it, expect } from "vitest";
import { validateEnv } from "./env";

const goodKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const goodJwt = "this-is-a-fake-but-long-enough-jwt-secret-32+";
const goodDb = "postgresql://u:p@h:5432/d";

const validBase = { JWT_SECRET: goodJwt, DATABASE_URL: goodDb, MASTER_KEY: goodKey };

describe("validateEnv", () => {
  it("returns a typed env object on valid input", () => {
    const e = validateEnv(validBase as NodeJS.ProcessEnv);
    expect(e.JWT_SECRET).toBe(goodJwt);
    expect(e.DATABASE_URL).toBe(goodDb);
    expect(e.MASTER_KEY).toBe(goodKey);
    expect(e.PORT).toBe(8080);
    expect(e.HOST).toBe("0.0.0.0");
    expect(e.NODE_ENV).toBe("development");
  });

  it("rejects missing JWT_SECRET", () => {
    expect(() =>
      validateEnv({ ...validBase, JWT_SECRET: undefined } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET is required/);
  });

  it("rejects short JWT_SECRET (< 32 chars)", () => {
    expect(() =>
      validateEnv({ ...validBase, JWT_SECRET: "short" } as NodeJS.ProcessEnv),
    ).toThrow(/at least 32 characters/);
  });

  it("rejects the .env.example placeholder JWT_SECRET", () => {
    // 28 chars — also fails the length check before even reaching the
    // exact-string check, so this test passes via length. Both are failure
    // modes for the same input, which is the point.
    expect(() =>
      validateEnv({ ...validBase, JWT_SECRET: "change-me-to-a-random-secret" } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("rejects non-postgres DATABASE_URL", () => {
    expect(() =>
      validateEnv({ ...validBase, DATABASE_URL: "mysql://u:p@h/d" } as NodeJS.ProcessEnv),
    ).toThrow(/postgres/);
  });

  it("rejects non-hex MASTER_KEY", () => {
    expect(() =>
      validateEnv({ ...validBase, MASTER_KEY: "REPLACE_ME_WITH_64_HEX_CHARS" } as NodeJS.ProcessEnv),
    ).toThrow(/64-char hex/);
  });

  it("rejects MASTER_KEY of wrong length", () => {
    expect(() =>
      validateEnv({ ...validBase, MASTER_KEY: "abc123" } as NodeJS.ProcessEnv),
    ).toThrow(/64-char hex/);
  });

  it("collects multiple errors into one message", () => {
    try {
      validateEnv({} as NodeJS.ProcessEnv);
      expect.fail("expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/JWT_SECRET/);
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).toMatch(/MASTER_KEY/);
    }
  });

  it("requires WEBAPP_ORIGIN in production", () => {
    expect(() =>
      validateEnv({ ...validBase, NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/WEBAPP_ORIGIN is required/);
  });

  it("does not require WEBAPP_ORIGIN in development", () => {
    expect(() => validateEnv(validBase as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("accepts production with WEBAPP_ORIGIN set", () => {
    expect(() =>
      validateEnv({
        ...validBase,
        NODE_ENV: "production",
        WEBAPP_ORIGIN: "https://app.example.com",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("uses provided PORT and HOST", () => {
    const e = validateEnv({ ...validBase, PORT: "9000", HOST: "127.0.0.1" } as NodeJS.ProcessEnv);
    expect(e.PORT).toBe(9000);
    expect(e.HOST).toBe("127.0.0.1");
  });
});
