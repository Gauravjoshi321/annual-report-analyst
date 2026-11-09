# 01 · Parsing

Compare plain PDF text extraction vs Docling markdown on the Infosys annual report, with a focus on how tables survive.

**Source:** `data/raw/infosysReport.pdf` (Infosys Integrated Annual Report 2025-26, 383 pages, 8.9 MB)
**Scripts:** `compare.ts` (page ranges, plain vs Docling), `parseFull.ts` (full report via Docling async API)

> Page numbers in this file are **PDF page numbers**. Printed page number = PDF page + 31 (PDF 285 = printed 316).

## Results

### 1. Plain text vs Docling (`compare.ts`)

| Range | Plain: time / headings / tables | Docling: time / headings / tables |
|---|---|---|
| Board's report (p35–39) | 0.6s / 1 / 0 | 12s / 30 / 4 |
| MD&A (p76–80) | 0.07s / 0 / 0 | 20s / 28 / 5 |
| Balance sheet (p285–289) | 0.1s / 0 / 0 | 36s / 5 / 7 |

- **Plain text (pdf-parse):** very fast and rows stay on one line, but there are no headings, no tables and no sections. Column headers get split from the data (`As at March 31,` / `2026  2025`), so once a row is chunked on its own, nothing says which number is FY26.
- **Docling:** recovers headings and real Markdown tables with header rows, but takes about 7s per page on CPU.
- **Problems in both:**
  - `₹` comes out as `` ` `` (a font-encoding issue in the PDF).
  - Docling merges the unit into table headers (`` (In ` - As at March 31, - 2026 ``).
  - Padded Markdown tables are **69% spaces**, so use `md_compact_tables=true`.
  - Plain text repeats the page header `Infosys Integrated Annual Report 2025-26  316` on every page.

### 2. Full parse (`parseFull.ts`)

- 383/383 pages parsed (382 `<!-- page-break -->` markers). Outputs: `infosysReportMD.md` (1.4 MB), `infosysReportJSON.json` (38 MB).
- Elements: **6,975 texts, 490 tables, 411 pictures**.

| Label | Count |
|---|---|
| text | 3,539 |
| section_header | 1,208 |
| list_item | 1,180 |
| page_footer | 694 |
| page_header | 149 |
| footnote | 117 |
| caption | 88 |

### 3. The document tree (JSON vs Markdown)

- The JSON is a `DoclingDocument`. **`body`** holds the **reading order** as pointers (`{"$ref": "#/texts/1"}`), and the content lives in flat arrays: **`texts`, `tables`, `pictures`**. `#/texts/1` means `texts[1]`.
- **`furniture`** holds the page headers and footers, so walking `body` skips the noise automatically.
- Every element has a `label` (its type) and `prov[0].page_no` + `bbox` (where it appears). This is the source for **citations**.
- **The hierarchy is flat:** paragraphs have `parent: #/body`, not their heading. The section a paragraph belongs to has to be **reconstructed** by walking `body` in order and remembering the last heading.
- **Tables** are stored as cells (`table_cells`) with row and column positions and a `column_header` flag. That makes it possible to write rows as self-contained sentences ("Goodwill, FY2026: ₹12,117 crore").
- **Markdown loses** the element types, page numbers, positions and cell structure. It's for people to read. The JSON is what serious chunking and citations should use.

### 4. Fragmentation

- **Designed pages (≈10–37, 119–123):** board profiles, KPI dashboards and infographics break into label/value pieces. **2,634 of 6,132** body texts are under 40 characters. Some labels are mislabelled as `section_header` (e.g. "Date of appointment").
- **133 paragraphs are split mid-sentence** at column and page breaks (e.g. p16 `"...14.9"` | `"with net new of 55%"`).
- These pages are about 10% of the report. The financial statements and narrative sections parsed well.

### 5. Pictures

- 411 pictures on 75 pages, of which 50 are large (more than about 1/10 of a page).
- Only 23 have a linked caption. 166 have text inside them that Docling extracted (quotes, chart labels).
- With `image_export_mode=placeholder`, each picture appears as `<!-- image -->` in Markdown. Anything that exists **only** in a chart or image is currently lost.

## Decisions

1. **Docling JSON is the source of truth** for every later experiment. Markdown is for reading, and plain text is kept only as a "bad parsing" baseline for Experiment 02.
2. **Repair in chunking, not in parsing.** Treat Docling elements as building blocks:
   - Join neighbouring `text` elements when the first doesn't end in `. : ; ? !` and the next starts lowercase (fixes split sentences).
   - Join consecutive short label/value elements under one heading into a single block.
   - Treat a short `section_header` followed immediately by a short value as a label, not a section.
3. **Cleanup step:** replace `` ` `` with `₹`, normalise whitespace, and keep the unit ("₹ crore") with the table.
4. **Don't try to perfect the parse.** Measure with the golden set first. Add page-level Gemini summaries for infographic pages only if questions about them fail.

## Open items

- [ ] Topic 2: heading hierarchy (`do_pdf_heading_hierarchy`). All 1,208 headings may be the same level.
- [ ] Topic 3: `table_mode` fast vs accurate on hard tables (p78, merged headers).
- [ ] Pictures and charts: description and extraction (see section 5).
