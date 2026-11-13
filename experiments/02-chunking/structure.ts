/**
 * Experiment 02 · Strategy 3 — Structure-aware chunking (Docling JSON).
 * Chunks never cross a heading; each chunk gets its heading path as a prefix.
 *
 * Run: pnpm tsx experiments/02-chunking/structure.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluate } from "../shared/score.js";
import type { Chunk } from "../shared/types.js";

interface Ref {
  $ref: string;
}

interface DocItem {
  self_ref: string;
  label: string;
  content_layer: string;
  children: Ref[];
  prov?: { page_no: number }[];
  text?: string;
  level?: number;
  data?: { grid: { text: string; column_header: boolean }[][] };
}

interface DoclingDoc {
  body: DocItem;
  texts: DocItem[];
  tables: DocItem[];
  pictures: DocItem[];
  groups: DocItem[];
}

const JSON_PATH = join(
  import.meta.dirname,
  "..",
  "data",
  "parsed",
  "docling",
  "infosysReportJSON.json",
);
const doc = JSON.parse(await readFile(JSON_PATH, "utf8")) as DoclingDoc;

const MAX_CHARS = 1024; // 256 tokens, same as the fixed-256 baseline
const MIN_CHARS = 200; // smaller sections carry into the next chunk

// "#/texts/12" → doc.texts[12]
function resolve(ref: Ref): DocItem {
  const [, kind, index] = ref.$ref.split("/");
  return (doc as unknown as Record<string, DocItem[]>)[kind!]![Number(index)]!;
}

const isSkipped = (item: DocItem) =>
  item.content_layer !== "body" || item.label === "page_header" || item.label === "page_footer";
const pageOf = (item: DocItem) => item.prov?.[0]?.page_no ?? 0;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const FIGURE_PIECE_CHARS = 400;
// Fake headings like "9.6%" or "40mn sq.ft." start with a number; keep "1. Energy…" / "2.3 Leases" headings.
const isNumberish = (t: string) => /^[\d`₹$]/.test(t.trim()) && !/^\d+(\.\d+)*\.?\s+[A-Z]/.test(t.trim());

// ---------- Step 1: JSON → flat list of blocks, in reading order ----------

type Block =
  | { kind: "heading"; text: string; level: number; page: number }
  | { kind: "text"; text: string; page: number }
  | { kind: "table"; header: string; rows: string[]; page: number };

function toBlocks(withPictures: boolean): Block[] {
  const blocks: Block[] = [];

  function visit(ref: Ref) {
    const item = resolve(ref);
    if (isSkipped(item)) return;
    const page = pageOf(item);

    if (ref.$ref.startsWith("#/groups")) {
      item.children.forEach(visit);
    } else if (ref.$ref.startsWith("#/tables")) {
      const grid = item.data!.grid;
      const line = (row: (typeof grid)[number]) => `| ${row.map((c) => clean(c.text)).join(" | ")} |`;
      blocks.push({ kind: "table", header: line(grid[0]!), rows: grid.slice(1).map(line), page });
    } else if (ref.$ref.startsWith("#/pictures")) {
      // Text Docling read inside the image (chart values, labels),
      // cut into small pieces so one big infographic doesn't drown its values.
      if (!withPictures) return;
      const texts = item.children.map(resolve).filter((c) => !isSkipped(c)).map((c) => clean(c.text ?? ""));
      let piece = "";
      for (const t of texts) {
        if (piece.length + t.length > FIGURE_PIECE_CHARS) {
          blocks.push({ kind: "text", text: `[Figure] ${piece}`, page });
          piece = "";
        }
        piece = piece ? `${piece} | ${t}` : t;
      }
      if (piece) blocks.push({ kind: "text", text: `[Figure] ${piece}`, page });
    } else if (item.label === "section_header" && item.level! < 6 && !isNumberish(item.text!)) {
      blocks.push({ kind: "heading", text: clean(item.text!), level: item.level!, page });
    } else {
      blocks.push({ kind: "text", text: clean(item.text!), page }); // text, list_item, caption, level-6 headings…
    }
  }

  doc.body.children.forEach(visit);
  return blocks;
}

// ---------- Step 2: blocks → chunks ----------

function toChunks(blocks: Block[], name: string, withHeader: boolean): Chunk[] {
  const chunks: Chunk[] = [];
  const stack: { level: number; text: string }[] = []; // current heading path
  let parts: string[] = [];
  let pages = new Set<number>();

  function flush() {
    if (parts.length === 0) return;
    const path = stack.map((h) => h.text).join(" > ");
    const body = parts.join("\n\n");
    chunks.push({
      id: `${name}-${String(chunks.length).padStart(4, "0")}`,
      text: withHeader ? `Section: ${path}\n\n${body}` : body,
      pages: [...pages],
    });
    parts = [];
    pages = new Set();
  }

  function add(text: string, page: number) {
    if (parts.join("\n\n").length + text.length > MAX_CHARS) flush();
    parts.push(text);
    pages.add(page);
  }

  for (const block of blocks) {
    if (block.kind === "heading") {
      if (parts.join("\n\n").length >= MIN_CHARS) flush(); // new section → close chunk (scraps carry over)
      while (stack.length > 0 && stack.at(-1)!.level >= block.level) stack.pop();
      stack.push({ level: block.level, text: block.text });
      add(block.text, block.page);
    } else if (block.kind === "text") {
      add(block.text, block.page); // an oversized text simply becomes its own chunk
    } else {
      // Table: add rows one by one; every new chunk restarts with the header row.
      add(block.header, block.page);
      for (const row of block.rows) {
        if (parts.join("\n\n").length + row.length > MAX_CHARS) {
          flush();
          parts.push(block.header);
          pages.add(block.page);
        }
        parts[parts.length - 1] += `\n${row}`;
      }
    }
  }
  flush();
  return chunks;
}

// ---------- Run ----------

const CONFIGS = [
  // v2: number-like headings ignored, picture text split into small pieces
  { name: "structure-256-v2", withHeader: true, withPictures: true },
  { name: "structure-256-noheader-v2", withHeader: false, withPictures: true },
];

for (const { name, withHeader, withPictures } of CONFIGS) {
  const chunks = toChunks(toBlocks(withPictures), name, withHeader);
  console.log(`\n${name}: ${chunks.length} chunks`);
  await evaluate(name, chunks, { verbose: false });
}
