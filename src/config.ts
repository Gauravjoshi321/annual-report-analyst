import { z } from "zod";

const Env = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.url(),
  GOOGLE_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  VOYAGE_API_KEY: z.string().min(1),
  DOCLING_URL: z.url().default("http://localhost:5001"),
});

export const env = Env.parse(process.env);
