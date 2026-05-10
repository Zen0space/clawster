import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "./auth";

// These tests are the regression seal on commit 445613f — when register and
// login disagreed on email canonicalization, "Foo@x.com" registered + "foo@x.com"
// login = 401 invalid_credentials. The schema's transform is the single source
// of truth; any future change that breaks normalization breaks these tests.

describe("loginSchema", () => {
  it("lowercases mixed-case email", () => {
    const r = loginSchema.safeParse({ email: "Foo@Example.com", password: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("foo@example.com");
  });

  it("trims whitespace from email", () => {
    const r = loginSchema.safeParse({ email: "  user@example.com  ", password: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("user@example.com");
  });

  it("trims AND lowercases together", () => {
    const r = loginSchema.safeParse({ email: " USER@Example.COM ", password: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("user@example.com");
  });

  it("rejects malformed email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ email: "u@e.com", password: "" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("requires password ≥ 8 chars", () => {
    const r = registerSchema.safeParse({
      email: "u@e.com",
      password: "1234567",
      licenseKey: "K",
    });
    expect(r.success).toBe(false);
  });

  it("accepts 8-char password", () => {
    const r = registerSchema.safeParse({
      email: "u@e.com",
      password: "12345678",
      licenseKey: "K",
    });
    expect(r.success).toBe(true);
  });

  it("requires non-empty licenseKey", () => {
    const r = registerSchema.safeParse({
      email: "u@e.com",
      password: "12345678",
      licenseKey: "",
    });
    expect(r.success).toBe(false);
  });

  it("normalizes email like loginSchema", () => {
    const r = registerSchema.safeParse({
      email: "Mixed@CASE.com",
      password: "12345678",
      licenseKey: "K",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("mixed@case.com");
  });

  it("makes fullName optional", () => {
    const r = registerSchema.safeParse({
      email: "u@e.com",
      password: "12345678",
      licenseKey: "K",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fullName).toBeUndefined();
  });
});
