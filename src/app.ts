import Fastify from "fastify";
import { env } from "./config.js";

export function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
