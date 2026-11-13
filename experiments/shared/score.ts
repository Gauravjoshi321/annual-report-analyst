/**
 * The scoreboard: how well does a set of chunks let us retrieve the right page
 * for each golden question?
 *
 *   const { summary } = await evaluate("fixed-512", chunks);
 *
 * Embeds chunks ("document") and questions ("query"), ranks every chunk by
 * cosine similarity, and reports Recall@1/3/5/10 + MRR. A retrieved chunk is a
 * hit when its pages overlap the question's acceptable pages.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EMBED_MODEL, embedTexts } from "./embed.js";
import type {
  Chunk,
  EvalSummary,
  GoldenSet,
  QuestionResult,
  QuestionType,
} from "./types.js";

const GOLDEN_FILE = join(import.meta.dirname, "golden.json");
const DEFAULT_RESULTS_FILE = join(
  import.meta.dirname,
  "..",
  "02-chunking",
  "results.json",
);
const TOP_K = 10;

export interface EvaluateOptions {
  /** Append the summary row to the results file (default true). */
  save?: boolean;
  /** Where to append results (default experiments/02-chunking/results.json). */
  resultsFile?: string;
  /** Print the per-question table (default true). */
  verbose?: boolean;
}

export async function loadGolden(): Promise<GoldenSet> {
  return JSON.parse(await readFile(GOLDEN_FILE, "utf8")) as GoldenSet;
}

/** Vectors are normalized by Voyage, so the dot product equals cosine similarity. */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Indexes of the k most similar chunks, best first. */
function topK(query: number[], chunkVectors: number[][], k: number): number[] {
  return chunkVectors
    .map((vec, i) => ({ i, score: dot(query, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.i);
}

const overlaps = (a: number[], b: number[]) => a.some((p) => b.includes(p));
const round = (n: number) => Math.round(n * 1000) / 1000;

export async function evaluate(
  strategy: string,
  chunks: Chunk[],
  options: EvaluateOptions = {},
): Promise<{ summary: EvalSummary; results: QuestionResult[] }> {
  const {
    save = true,
    resultsFile = DEFAULT_RESULTS_FILE,
    verbose = true,
  } = options;
  if (chunks.length === 0)
    throw new Error(`Strategy "${strategy}" produced no chunks`);

  console.log(
    `\n=== Evaluating "${strategy}" (${chunks.length} chunks, ${EMBED_MODEL}) ===`,
  );
  const { questions } = await loadGolden();

  // 1. Embed everything (cached after the first run).
  const chunkVectors = await embedTexts(
    chunks.map((c) => c.text),
    "document",
  );
  const questionVectors = await embedTexts(
    questions.map((q) => q.question),
    "query",
  );

  // 2. Retrieve top-k per question and find the rank of the first correct chunk.
  const results: QuestionResult[] = questions.map((q, qi) => {
    const top = topK(questionVectors[qi]!, chunkVectors, TOP_K);
    const hitAt = top.findIndex((ci) => overlaps(chunks[ci]!.pages, q.pages));
    return {
      id: q.id,
      type: q.type,
      rank: hitAt === -1 ? null : hitAt + 1,
      topPages: chunks[top[0]!]!.pages,
    };
  });

  // 3. Metrics.
  const recallAt = (k: number, rs = results) =>
    rs.filter((r) => r.rank !== null && r.rank <= k).length / rs.length;
  const mrr =
    results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) /
    results.length;

  const recallAt5ByType: Partial<Record<QuestionType, number>> = {};
  for (const type of new Set(results.map((r) => r.type))) {
    recallAt5ByType[type] = round(
      recallAt(
        5,
        results.filter((r) => r.type === type),
      ),
    );
  }

  const lengths = chunks.map((c) => c.text.length);
  const summary: EvalSummary = {
    strategy,
    timestamp: new Date().toISOString(),
    embedModel: EMBED_MODEL,
    chunkCount: chunks.length,
    avgChars: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    maxChars: Math.max(...lengths),
    recallAt1: round(recallAt(1)),
    recallAt3: round(recallAt(3)),
    recallAt5: round(recallAt(5)),
    recallAt10: round(recallAt(10)),
    mrr: round(mrr),
    recallAt5ByType,
  };

  // 4. Report.
  if (verbose) {
    console.log(
      "\nPer question (rank = position of first correct chunk, – = not in top 10):",
    );
    console.table(
      results.map((r) => ({
        id: r.id,
        type: r.type,
        rank: r.rank ?? "–",
        "top-1 pages": r.topPages.join(","),
      })),
    );
  }
  console.log("\nSummary:");
  console.table({
    chunks: summary.chunkCount,
    "avg chars": summary.avgChars,
    "R@1": summary.recallAt1,
    "R@3": summary.recallAt3,
    "R@5": summary.recallAt5,
    "R@10": summary.recallAt10,
    MRR: summary.mrr,
  });
  console.log("Recall@5 by type:", summary.recallAt5ByType);

  // 5. Append to the scoreboard file.
  if (save) {
    const rows: EvalSummary[] = existsSync(resultsFile)
      ? (JSON.parse(await readFile(resultsFile, "utf8")) as EvalSummary[])
      : [];
    rows.push(summary);
    await writeFile(resultsFile, JSON.stringify(rows, null, 2), "utf8");
    console.log(`Saved to ${resultsFile}`);
  }

  return { summary, results };
}