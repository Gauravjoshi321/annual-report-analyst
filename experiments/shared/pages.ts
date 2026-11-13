/**
 * Load the parsed report as pages and join them into one string,
 * remembering where each page starts so any chunk can be mapped back to pages.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const MD_PATH = join(DATA_DIR, "parsed", "docling", "infosysReportMD.md");
const PDF_PATH = join(DATA_DIR, "raw", "infosysReport.pdf");

const PAGE_BREAK = "<!-- page-break -->";
const PAGE_SEPARATOR = "\n\n";
const EXPECTED_PAGES = 383;

export const CHARS_PER_TOKEN = 4;

export interface Page {
  num: number;
  text: string;
}

export interface JoinedDoc {
  text: string;
  /** Start offset of each page in `text`, in page order. */
  pageStarts: { page: number; start: number }[];
}

export async function loadDoclingPages(): Promise<Page[]> {
  const md = await readFile(MD_PATH, "utf8");
  const pages = md
    .split(PAGE_BREAK)
    .map((text, i) => ({ num: i + 1, text: text.replaceAll("<!-- image -->", "").trim() }));
  if (pages.length !== EXPECTED_PAGES) {
    throw new Error(`Expected ${EXPECTED_PAGES} pages, got ${pages.length}`);
  }
  return pages;
}

export async function loadPlainPages(): Promise<Page[]> {
  const parser = new PDFParse({ data: await readFile(PDF_PATH) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => ({ num: p.num, text: p.text.trim() }));
  } finally {
    await parser.destroy();
  }
}

/** Concatenate pages, remembering where each one starts. */
export function joinPages(pages: Page[]): JoinedDoc {
  let text = "";
  const pageStarts: JoinedDoc["pageStarts"] = [];
  for (const page of pages) {
    if (text.length > 0) text += PAGE_SEPARATOR;
    pageStarts.push({ page: page.num, start: text.length }); // current length = this page's start
    text += page.text;
  }
  return { text, pageStarts };
}

/** Page containing a character offset: the last page whose start <= offset. */
export function pageAt(doc: JoinedDoc, offset: number): number {
  const starts = doc.pageStarts;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (starts[mid]!.start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return starts[lo]!.page;
}

/** All pages covered by the character range [start, end). */
export function pagesInRange(doc: JoinedDoc, start: number, end: number): number[] {
  const first = pageAt(doc, start);
  const last = pageAt(doc, Math.max(start, end - 1));
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
