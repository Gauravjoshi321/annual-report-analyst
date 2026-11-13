/**
 * Experiment 02 · Strategy 1 — Fixed-size chunking (the baseline).
 *
 * Joins the whole report into one string and cuts it every N tokens
 * (estimated as N × 4 chars), with optional overlap. Ignores headings,
 * tables and sentences entirely — every smarter strategy must beat this.
 *
 * Run: pnpm tsx experiments/02-chunking/fixed.ts
 */
import {
  CHARS_PER_TOKEN,
  type JoinedDoc,
  joinPages,
  loadDoclingPages,
  loadPlainPages,
  pagesInRange,
} from "../shared/pages.js";
import { evaluate } from "../shared/score.js";
import type { Chunk } from "../shared/types.js";

const CONFIGS = [
  { size: 256, overlap: 0 },
  { size: 512, overlap: 0 },
  { size: 512, overlap: 64 },
  { size: 1024, overlap: 128 },
];

function fixedChunks(
  doc: JoinedDoc,
  sizeTokens: number,
  overlapTokens: number,
  name: string,
): Chunk[] {
  const size = sizeTokens * CHARS_PER_TOKEN;
  const step = (sizeTokens - overlapTokens) * CHARS_PER_TOKEN;
  if (step <= 0) throw new Error("overlap must be smaller than size");

  const chunks: Chunk[] = [];
  for (let start = 0; start < doc.text.length; start += step) {
    const end = Math.min(start + size, doc.text.length);
    const text = doc.text.slice(start, end).trim();
    if (text.length > 0) {
      chunks.push({
        id: `${name}-${String(chunks.length).padStart(4, "0")}`,
        text,
        pages: pagesInRange(doc, start, end),
        meta: { start, end },
      });
    }
    if (end === doc.text.length) break;
  }
  return chunks;
}

const docling = joinPages(await loadDoclingPages());
console.log(`Docling markdown: ${docling.text.length.toLocaleString()} chars`);

for (const { size, overlap } of CONFIGS) {
  const name = `fixed-${size}-o${overlap}`;
  const chunks = fixedChunks(docling, size, overlap, name);
  console.log(`\n${name}: ${chunks.length} chunks`);
  await evaluate(name, chunks, { verbose: false });
}

// Same chunker on plain pdf-parse text: how much does Docling parsing help?
const plain = joinPages(await loadPlainPages());
const plainName = "fixed-512-o64-plain";
const plainChunks = fixedChunks(plain, 512, 64, plainName);
console.log(`\n${plainName}: ${plainChunks.length} chunks`);
await evaluate(plainName, plainChunks, { verbose: false });
