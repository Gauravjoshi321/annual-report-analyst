/**
 * Embeddings with an on-disk cache, from one of two providers:
 *
 *   EMBED_PROVIDER=ollama  (default) local nomic-embed-text via Ollama, no limits, no cost
 *   EMBED_PROVIDER=voyage            Voyage API (voyage-3.5), needs VOYAGE_API_KEY
 *
 * - Chunks use inputType "document", questions use "query".
 *   Voyage handles this natively; for nomic we add its "search_document: " /
 *   "search_query: " prefixes (same idea, done by hand).
 * - Every (model, inputType, text) is embedded at most once; re-runs are free.
 *   Each model has its own cache file, so results never mix.
 * - Vectors are L2-normalized, so dot product = cosine similarity.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { VoyageAIClient } from "voyageai";
import type { InputType } from "./types.js";

type Provider = "ollama" | "voyage";

interface ProviderConfig {
  model: string;
  maxBatchItems: number;
  /** Per-request token budget (tokens estimated as chars / 4). */
  maxBatchTokens: number;
  embed: (batch: string[], inputType: InputType) => Promise<number[][]>;
}

const PROVIDER = (process.env.EMBED_PROVIDER ?? "ollama") as Provider;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MAX_RETRIES = 6;

// ---------- providers ----------

let voyageClient: VoyageAIClient | undefined;

async function embedVoyage(batch: string[], inputType: InputType): Promise<number[][]> {
  if (!voyageClient) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY is not set. Run with: pnpm tsx --env-file=.env <script>");
    }
    voyageClient = new VoyageAIClient({ apiKey });
  }
  const res = await voyageClient.embed({ input: batch, model: PROVIDERS.voyage.model, inputType });
  // Results carry their original position in `index`; sort to be safe.
  return [...(res.data ?? [])]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding ?? []);
}

const NOMIC_PREFIX: Record<InputType, string> = {
  document: "search_document: ",
  query: "search_query: ",
};

async function embedOllama(batch: string[], inputType: InputType): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PROVIDERS.ollama.model,
      input: batch.map((t) => NOMIC_PREFIX[inputType] + t),
      truncate: true, // cut inputs longer than the context instead of failing
    }),
  });
  if (!res.ok) {
    const err = new Error(`Ollama ${res.status}: ${await res.text()}`) as Error & { statusCode: number };
    err.statusCode = res.status;
    throw err;
  }
  const body = (await res.json()) as { embeddings: number[][] };
  return body.embeddings;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  ollama: { model: "nomic-embed-text", maxBatchItems: 32, maxBatchTokens: 32_000, embed: embedOllama },
  voyage: { model: "voyage-3.5", maxBatchItems: 128, maxBatchTokens: 100_000, embed: embedVoyage },
};

const config = PROVIDERS[PROVIDER];
if (!config) throw new Error(`Unknown EMBED_PROVIDER "${PROVIDER}" (use "ollama" or "voyage")`);

/** Model in use; recorded in every scoreboard row. */
export const EMBED_MODEL = config.model;

// ---------- cache ----------

const CACHE_DIR = join(import.meta.dirname, "..", "data", "cache");
const CACHE_FILE = join(CACHE_DIR, `embeddings-${EMBED_MODEL}.json`);
const SAVE_EVERY_MS = 30_000;

type Cache = Record<string, number[]>;
let cache: Cache | undefined;

async function loadCache(): Promise<Cache> {
  if (!cache) {
    cache = existsSync(CACHE_FILE)
      ? (JSON.parse(await readFile(CACHE_FILE, "utf8")) as Cache)
      : {};
  }
  return cache;
}

async function saveCache(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache), "utf8");
}

function cacheKey(text: string, inputType: InputType): string {
  return createHash("sha256")
    .update(`${EMBED_MODEL}\n${inputType}\n${text}`)
    .digest("hex");
}

// ---------- batching ----------

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Split texts into batches that respect both the item and token limits. */
function toBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const t = estimateTokens(text);
    if (
      current.length > 0 &&
      (current.length >= config.maxBatchItems || tokens + t > config.maxBatchTokens)
    ) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

/** One request, retried with exponential backoff on rate limits / transient errors. */
async function embedBatch(batch: string[], inputType: InputType): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const vectors = await config.embed(batch, inputType);
      if (vectors.length !== batch.length) {
        throw new Error(`${PROVIDER} returned ${vectors.length} embeddings for ${batch.length} inputs`);
      }
      return vectors.map(normalize);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      const waitMs = 2 ** attempt * 5_000; // 5s, 10s, 20s, ...
      console.warn(`  ${PROVIDER} ${status ?? "network"} error, retrying in ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
}

// ---------- public API ----------

/**
 * Embed texts, returning one vector per input in the same order.
 * Only texts missing from the cache are sent to the provider.
 */
export async function embedTexts(texts: string[], inputType: InputType): Promise<number[][]> {
  const store = await loadCache();
  const keys = texts.map((t) => cacheKey(t, inputType));

  // Unique texts that still need embedding (duplicates are embedded once).
  const missing = new Map<string, string>();
  texts.forEach((text, i) => {
    const key = keys[i]!;
    if (!(key in store)) missing.set(key, text);
  });

  if (missing.size > 0) {
    const entries = [...missing.entries()];
    const batches = toBatches(entries.map(([, text]) => text));
    console.log(
      `  embedding ${entries.length} new ${inputType} texts with ${EMBED_MODEL} ` +
        `in ${batches.length} batch(es) (${texts.length - entries.length} cached)`,
    );

    const t0 = performance.now();
    let lastSave = t0;
    let offset = 0;
    for (const [b, batch] of batches.entries()) {
      const vectors = await embedBatch(batch, inputType);
      vectors.forEach((vec, j) => {
        store[entries[offset + j]![0]] = vec;
      });
      offset += batch.length;

      // Save periodically so a crash loses at most ~30s of work.
      if (performance.now() - lastSave > SAVE_EVERY_MS) {
        await saveCache();
        lastSave = performance.now();
        const done = b + 1;
        const secs = (performance.now() - t0) / 1000;
        const eta = (secs / done) * (batches.length - done);
        console.log(`  ${done}/${batches.length} batches, ~${Math.round(eta)}s left`);
      }
    }
    await saveCache();
    console.log(`  done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }

  return keys.map((key) => store[key]!);
}
