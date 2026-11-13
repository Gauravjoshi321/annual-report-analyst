# 01 · Parsing

Infosys Annual Report 2025-26, 383 pages. Page numbers below are PDF pages (printed page = PDF page + 31).

## Plain text vs Docling

| Range | Plain: time / headings / tables | Docling: time / headings / tables |
|---|---|---|
| Board's report (p35–39) | 0.6s / 1 / 0 | 12s / 30 / 4 |
| MD&A (p76–80) | 0.07s / 0 / 0 | 20s / 28 / 5 |
| Balance sheet (p285–289) | 0.1s / 0 / 0 | 36s / 5 / 7 |

- Plain text loses headings and table structure: column headers get split from the numbers.
- Docling keeps headings and tables. Without `md_compact_tables`, its tables are 69% spaces.
- `₹` comes out as `` ` `` in both.

## Full Docling parse

- 383/383 pages, about 40 minutes on CPU.
- 6,975 texts, 490 tables, 411 pictures.
- The JSON has page numbers and element types; the Markdown loses them.
- Heading levels: all 1,208 headings are the same level by default. `do_pdf_heading_hierarchy=true` gives 5 levels.
- Designed pages (10–37, 119–123) break into small label/value pieces: 2,634 of 6,132 texts are under 40 characters.
- 133 paragraphs are split mid-sentence.
- Only 23 of 411 pictures have captions, so chart values are lost.

## Decisions

- Docling is the main source. Plain text is kept only as a baseline.
- Fix split text and fragments during chunking, not in the parser.
