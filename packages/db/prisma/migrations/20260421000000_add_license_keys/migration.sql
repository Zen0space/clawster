CREATE TABLE "license_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "license_keys_key_key" ON "license_keys"("key");

ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_used_by_id_fkey"
    FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
