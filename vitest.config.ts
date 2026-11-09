import { defineConfig } from "vitest/config";

// Tests never call real services, so required settings get dummy values.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5433/test",
      GOOGLE_API_KEY: "test",
      VOYAGE_API_KEY: "test",
      LANGSMITH_TRACING: "false",
    },
  },
});
