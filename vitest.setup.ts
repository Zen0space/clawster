// Provide synthetic env vars so any module that runs validateEnv() at import
// (notably packages/backend/src/env.ts) can be imported in tests without the
// validation throwing. Tests that exercise validateEnv() pass their own input.
process.env.JWT_SECRET ??= "test-jwt-secret-must-be-at-least-32-chars-long";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NODE_ENV ??= "test";
