import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // An empty database for testing the migration runner from scratch.
          d1Databases: ["FRESH_DB"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEV_MODE: "true",
            ADMIN_EMAILS: "bootstrap-admin@example.com",
            RESEND_API_KEY: "",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
