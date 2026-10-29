import { buildApp } from "./app.js";
import { env } from "./config.js";

const app = buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
