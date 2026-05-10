import { PgBoss } from "pg-boss";
import { env } from "../../env";

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
});
