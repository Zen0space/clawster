import "dotenv/config";

function validate(): { JWT_SECRET: string; DATABASE_URL: string; MASTER_KEY: string; PORT: number; HOST: string } {
  const errors: string[] = [];
  const { JWT_SECRET, DATABASE_URL, MASTER_KEY } = process.env;

  if (!JWT_SECRET) {
    errors.push("JWT_SECRET is required. Generate with: openssl rand -base64 48");
  } else if (JWT_SECRET.length < 32) {
    errors.push(`JWT_SECRET must be at least 32 characters (got ${JWT_SECRET.length})`);
  } else if (JWT_SECRET === "change-me-to-a-random-secret") {
    errors.push("JWT_SECRET still uses the .env.example placeholder — set a real secret");
  }

  if (!DATABASE_URL) {
    errors.push("DATABASE_URL is required (postgres://user:pass@host:port/db)");
  } else if (!/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
    errors.push("DATABASE_URL must start with postgres:// or postgresql://");
  }

  if (!MASTER_KEY) {
    errors.push("MASTER_KEY is required. Generate with: openssl rand -hex 32");
  } else if (!/^[0-9a-f]{64}$/i.test(MASTER_KEY)) {
    errors.push(`MASTER_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32`);
  }

  if (errors.length) {
    const msg = `Invalid environment configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(msg);
  }

  return {
    JWT_SECRET: JWT_SECRET as string,
    DATABASE_URL: DATABASE_URL as string,
    MASTER_KEY: MASTER_KEY as string,
    PORT: Number(process.env.PORT ?? 8080),
    HOST: process.env.HOST ?? "0.0.0.0",
  };
}

export const env = validate();
