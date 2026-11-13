/**
 * Shared types for all experiments.
 *
 * Every chunking strategy must return `Chunk[]`; the scorer only relies on
 * `text` (what gets embedded) and `pages` (what decides a hit).
 */

/** One retrievable piece of the document. */
export interface Chunk {
  /** Unique within a strategy, e.g. "fixed-512-0042". */
  id: string;
  /** The text that gets embedded and searched. */
  text: string;
  /** PDF page numbers this chunk covers (several if it crosses a page break). */
  pages: number[];
  /** Optional extras: section path, element types, token count, etc. */
  meta?: Record<string, unknown>;
}

/** Question categories in golden.json, used to break down scores. */
export type QuestionType =
  | "table"
  | "narrative"
  | "profile"
  | "multi"
  | "trap"
  | "chart";

/** One entry in experiments/shared/golden.json. */
export interface GoldenQuestion {
  id: string;
  type: QuestionType;
  question: string;
  answer: string;
  /** Acceptable source pages (PDF numbering); any overlap counts as a hit. */
  pages: number[];
  section: string;
  /** Exact strings that appear on at least one listed page (used to validate the file). */
  check: string[];
}

/** Shape of golden.json on disk. */
export interface GoldenSet {
  source: string;
  notes: string;
  questions: GoldenQuestion[];
}

/** Voyage input type: chunks are "document", questions are "query". */
export type InputType = "document" | "query";

/** Per-question outcome of one evaluation run. */
export interface QuestionResult {
  id: string;
  type: QuestionType;
  /** 1-based rank of the first chunk whose pages overlap the question's pages; null if not in top-k. */
  rank: number | null;
  /** Pages of the top-1 chunk, to see what was retrieved instead. */
  topPages: number[];
}

/** One row of the scoreboard (appended to experiments/02-chunking/results.json). */
export interface EvalSummary {
  strategy: string;
  timestamp: string;
  embedModel: string;
  chunkCount: number;
  avgChars: number;
  maxChars: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  /** Recall@5 per question type. */
  recallAt5ByType: Partial<Record<QuestionType, number>>;
}
