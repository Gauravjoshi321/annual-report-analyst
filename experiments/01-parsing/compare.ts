// /**
//  * Experiment 01 — Parsing.
//  *
//  * Extracts the same page ranges of the Infosys annual report two ways and
//  * saves both outputs so they can be compared side by side:
//  *   A. plain text  (pdf-parse: raw characters, no layout understanding)
//  *   B. Docling     (layout models: headings, reading order, real tables)
//  *
//  * Run from anywhere:  pnpm tsx experiments/01-parsing/compare.ts
//  * Requires:           docker compose up -d docling
//  */
// import { openAsBlob } from "node:fs";
// import { mkdir, readFile, writeFile } from "node:fs/promises";
// import { join } from "node:path";
// import { PDFParse } from "pdf-parse";

// // ---------- config ----------

// const DOCLING_URL = process.env.DOCLING_URL || "http://localhost:5001";

// const DATA_DIR = join(import.meta.dirname, "..", "data");
// const PDF_PATH = join(DATA_DIR, "raw", "infosysReport.pdf");
// const OUT_DIR = join(DATA_DIR, "parsed");

// // PDF page numbers (what the viewer toolbar shows), NOT the printed numbers.
// // Printed number = PDF page + 31 in this report (e.g. PDF 285 = printed 316).
// const RANGES = [
//   { name: "board-report", start: 35, end: 39 }, // narrative prose
//   { name: "mdna", start: 76, end: 80 }, // prose mixed with tables
//   { name: "balance-sheet", start: 285, end: 289 }, // consolidated financials
// ] as const;

// type Extractor = "plain" | "docling";

// interface Extraction {
//   text: string;
//   ms: number;
// }

// // // ---------- extractors ----------

// async function extractPlain(start: number, end: number): Promise<Extraction> {
//   const t0 = performance.now();
//   const parser = new PDFParse({ data: await readFile(PDF_PATH) });
//   try {
//     // first + last together = inclusive page range
//     const result = await parser.getText({ first: start, last: end });
//     return { text: result.text, ms: performance.now() - t0 };
//   } finally {
//     await parser.destroy();
//   }
// }

// interface DoclingResponse {
//   status: string;
//   processing_time: number;
//   errors: unknown[];
//   document: { md_content: string | null };
// }

// async function extractDocling(start: number, end: number): Promise<Extraction> {
//   const t0 = performance.now();

//   const form = new FormData();
//   form.append("files", await openAsBlob(PDF_PATH), "infosysReport.pdf");
//   form.append("to_formats", "md");
//   form.append("page_range", String(start)); // page_range is a [start, end] pair,
//   form.append("page_range", String(end)); //  sent as two form fields
//   form.append("table_mode", "accurate");
//   form.append("md_page_break_placeholder", "<!-- page-break -->"); // <-- Fixed (no trailing space)
//   form.append("image_export_mode", "placeholder"); // don't inline base64 images
//   form.append("do_ocr", "false"); // digital PDF, no scanned pages here

//   const res = await fetch(`${DOCLING_URL}/v1/convert/file`, {
//     method: "POST",
//     body: form,
//   });
//   if (!res.ok) {
//     throw new Error(`Docling ${res.status}: ${await res.text()}`);
//   }

//   const body = (await res.json()) as DoclingResponse;
//   if (body.status !== "success") {
//     console.warn(`Docling status "${body.status}"`, body.errors);
//   }
//   return { text: body.document.md_content ?? "", ms: performance.now() - t0 };
// }

// // // ---------- helpers ----------

// async function save(extractor: Extractor, name: string, text: string) {
//   const dir = join(OUT_DIR, extractor);
//   await mkdir(dir, { recursive: true });
//   const ext = extractor === "plain" ? "txt" : "md";
//   const file = join(dir, `${name}.${ext}`);
//   await writeFile(file, text, "utf8");
//   return file;
// }

// function stats(text: string) {
//   const lines = text.split("\n");
//   return {
//     chars: text.length,
//     lines: lines.length,
//     // Markdown headings ("# ...", "## ...")
//     headings: lines.filter((l) => /^#{1,6}\s/.test(l)).length,
//     // Markdown table separator rows ("|---|---|"), one per table
//     tables: lines.filter((l) => /^\|[\s:|-]*-{3,}/.test(l.trim())).length,
//   };
// }

// // ---------- main ----------

// const rows = [];

// for (const range of RANGES) {
//   const label = `${range.name} (p${range.start}-${range.end})`;

//   console.log(`\n▶ ${label}: plain text...`);
//   const plain = await extractPlain(range.start, range.end);
//   await save("plain", range.name, plain.text);
//   rows.push({
//     range: label,
//     extractor: "plain",
//     ms: Math.round(plain.ms),
//     ...stats(plain.text),
//   });

//   console.log(`▶ ${label}: Docling (can take a minute)...`);
//   const docling = await extractDocling(range.start, range.end);
//   await save("docling", range.name, docling.text);
//   rows.push({
//     range: label,
//     extractor: "docling",
//     ms: Math.round(docling.ms),
//     ...stats(docling.text),
//   });
// }

// console.log("\nResults:");
// console.table(rows);
// console.log(`\nOutputs saved under ${OUT_DIR}`);

import { openAsBlob } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------- config ----------

const DOCLING_URL = process.env.DOCLING_URL || "http://localhost:5001";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const PDF_PATH = join(DATA_DIR, "raw", "infosysReport.pdf");
const OUT_DIR = join(DATA_DIR, "parsed");

interface Extraction {
  taskId: string;
  status: string;
}

// // ---------- extractors ----------
interface DoclingSubmitResponse {
  task_id: string;
  task_status: string;
  created_at: string;
}

async function submit(): Promise<Extraction> {
  const form = new FormData();
  form.append("files", await openAsBlob(PDF_PATH), "infosysReport.pdf");
  form.append("to_formats", "md");
  form.append("to_formats", "json");
  form.append("page_range", String(35)); // page_range is a [start, end] pair,
  form.append("page_range", String(39));
  form.append("md_compact_tables", "true");
  form.append("do_pdf_heading_hierarchy", "true");
  form.append("table_mode", "accurate");
  form.append("md_page_break_placeholder", "<!-- page-break -->");
  form.append("image_export_mode", "placeholder"); // don't inline base64 images
  form.append("do_ocr", "false"); // digital PDF, no scanned pages here

  const res = await fetch(`${DOCLING_URL}/v1/convert/file/async`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Docling ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as DoclingSubmitResponse;

  return {
    taskId: body.task_id ?? "",
    status: body.task_status ?? "",
  };
}

async function poll(taskId: string) {
  const res = await fetch(`${DOCLING_URL}/v1/status/poll/${taskId}`);
  const ans = await res.json();
  return ans;
}

async function getData(taskId: string) {
  const res = await fetch(`${DOCLING_URL}/v1/result/${taskId}`);
  const ans = await res.json();
  return ans;
}

// // ---------- helpers ----------

async function save(
  folderName: string,
  fileName: string,
  text: string,
  ext: string,
) {
  const dir = join(OUT_DIR, folderName);
  await mkdir(dir, { recursive: true });

  const file = join(dir, `${fileName}.${ext}`);
  await writeFile(file, text, "utf8");
  return file;
}

function stats(text: string) {
  const lines = text.split("\n");
  return {
    chars: text.length,
    lines: lines.length,
    // Markdown headings ("# ...", "## ...")
    headings: lines.filter((l) => /^#{1,6}\s/.test(l)).length,
    // Markdown table separator rows ("|---|---|"), one per table
    tables: lines.filter((l) => /^\|[\s:|-]*-{3,}/.test(l.trim())).length,
  };
}

// ---------- main ----------

async function loop(taskId: string) {
  let status = "pending";
  while (status === "pending" || status === "started") {
    const res = await poll(taskId);
    status = res.task_status;

    console.log(status);

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  return status;
}

async function main() {
  const t0 = performance.now();

  // 1. Call the submit
  const submitResponse = await submit();
  const taskId = submitResponse.taskId;

  // 2. Call the poll
  const pollResponse = await loop(taskId);

  const ms = performance.now() - t0;

  // 3. Call the save
  if (pollResponse === "success") {
    const data = await getData(taskId);
    console.table({
      extractor: "docling",
      ms: Math.round(ms),
      ...stats(data.document.md_content ?? ""),
    });
    await save("docling", "testMD", data.document.md_content, "md");
    await save(
      "docling",
      "testJSON",
      JSON.stringify(data.document.json_content, null, 2),
      "json",
    );
  } else {
    console.log(`Task failed with status: ${pollResponse}`);
  }
}

main();
