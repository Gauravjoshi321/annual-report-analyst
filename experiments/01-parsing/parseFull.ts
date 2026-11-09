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
  //   form.append("page_range", String(285)); // page_range is a [start, end] pair,
  //   form.append("page_range", String(289));
  form.append("do_pdf_heading_hierarchy", "true");
  form.append("md_compact_tables", "true");
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
    await save("docling", "infosysReportMD", data.document.md_content, "md");
    await save(
      "docling",
      "infosysReportJSON",
      JSON.stringify(data.document.json_content, null, 2),
      "json",
    );
  } else {
    console.log(`Task failed with status: ${pollResponse}`);
  }
}

main();
