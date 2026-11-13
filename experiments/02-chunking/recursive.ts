/**
 * Experiment 02 · Strategy 2 — Recursive chunking.
 *
 * Splits on the most natural break that keeps a piece under the size limit:
 * paragraphs ("\n\n") → lines ("\n") → sentences (". ") → words (" ") → chars.
 * Same size budget as fixed.ts (tokens × 4 chars), so results are comparable.
 *
 * Run: pnpm tsx experiments/02-chunking/recursive.ts
 */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  CHARS_PER_TOKEN,
  type JoinedDoc,
  joinPages,
  loadDoclingPages,
  pagesInRange,
} from "../shared/pages.js";
import { evaluate } from "../shared/score.js";
import type { Chunk } from "../shared/types.js";

const CONFIGS = [
  { size: 256, overlap: 0 },
  { size: 512, overlap: 0 },
  { size: 512, overlap: 64 },
];

const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

async function recursiveChunks(
  doc: JoinedDoc,
  sizeTokens: number,
  overlapTokens: number,
  name: string,
): Promise<Chunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: sizeTokens * CHARS_PER_TOKEN,
    chunkOverlap: overlapTokens * CHARS_PER_TOKEN,
    separators: SEPARATORS,
  });
  const pieces = await splitter.splitText(doc.text);

  // The splitter returns only strings, so locate each piece in the full text
  // (searching forward from the previous piece) to recover its pages.
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (const text of pieces) {
    const start = doc.text.indexOf(text, cursor);
    if (start === -1) throw new Error(`Could not locate chunk ${chunks.length} in the document`);
    const end = start + text.length;
    chunks.push({
      id: `${name}-${String(chunks.length).padStart(4, "0")}`,
      text,
      pages: pagesInRange(doc, start, end),
      meta: { start, end },
    });
    cursor = start + 1; // next piece starts after this one's start (overlap allowed)
  }
  return chunks;
}

const doc = joinPages(await loadDoclingPages());

for (const { size, overlap } of CONFIGS) {
  const name = `recursive-${size}-o${overlap}`;
  const chunks = await recursiveChunks(doc, size, overlap, name);
  console.log(`\n${name}: ${chunks.length} chunks`);
  await evaluate(name, chunks, { verbose: false });
}
