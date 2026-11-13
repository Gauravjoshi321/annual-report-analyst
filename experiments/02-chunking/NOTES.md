# 02 · Chunking

**Setup:** Docling Markdown of the full report · 25 golden questions · `nomic-embed-text` (local Ollama) · top-10 cosine search.
A hit means a retrieved chunk is on a correct page. One question = 0.04.

## Fixed-size

| Config | Chunks | R@1 | R@5 | MRR |
|---|---|---|---|---|
| **fixed-256-o0** | 1,322 | 0.32 | **0.76** | **0.49** |
| fixed-512-o0 | 661 | 0.28 | 0.56 | 0.41 |
| fixed-512-o64 | 756 | 0.32 | 0.68 | 0.45 |
| fixed-1024-o128 | 378 | 0.28 | 0.52 | 0.41 |
| fixed-512-o64-plain | 724 | 0.20 | 0.48 | 0.34 |

Config names are size and overlap in tokens. `-plain` is the same chunker run on pdf-parse text.

- **Smaller chunks did better:** R@5 was 0.76 at 256 tokens and 0.52 at 1024.
- **Tables suffer most from big chunks:** table R@5 was 0.63 at 256 tokens and 0.25 at 1024.
- **Overlap helped:** 0.56 → 0.68 R@5 at 512 tokens.
- **Docling beat plain text:** 0.68 vs 0.48 R@5 with the same chunker.
- **Chart questions scored 0 in every config.**
- **Ranking is weak:** R@1 is about 0.3, so the right chunk is rarely ranked first.

**Baseline to beat: fixed-256-o0, R@5 0.76, MRR 0.49.**

## Recursive

| Config | Chunks | R@1 | R@5 | MRR |
|---|---|---|---|---|
| recursive-256-o0 | 1,838 | **0.48** | 0.60 | **0.55** |
| recursive-512-o0 | 841 | 0.24 | 0.48 | 0.34 |
| recursive-512-o64 | 871 | 0.20 | 0.52 | 0.32 |

- **Lost to fixed-size on R@5:** 0.60 vs 0.76.
- **Best R@1 and MRR so far** (256 tokens): when it finds the right chunk, it ranks it higher.
- **Tables got worse:** table R@5 0.38 vs 0.63 for fixed-size at 256 tokens. Rows are split at line breaks, so the header row ends up in a different chunk.
- **Leftover scraps:** 124 chunks are under 200 characters (lone headings like `###### Notes :`), and they compete with real answers.
- Overlap barely helped (0.48 → 0.52).

## Structure-aware (Docling JSON)

| Config | Chunks | R@1 | R@5 | MRR |
|---|---|---|---|---|
| structure-256 (with `Section:` path) | 1,695 | 0.32 | 0.52 | 0.40 |
| structure-256-noheader | 1,695 | 0.32 | **0.68** | **0.44** |
| structure-256-nopics | 1,667 | 0.32 | 0.48 | 0.39 |

- **Lost to fixed-256** (0.76) in every config.
- **The path prefix hurt:** R@5 0.68 → 0.52. Heading levels are noisy (e.g. `9.6%` and `40mn sq.ft.` are detected as L5 headings), so paths add wrong context.
- **Picture text helped a little** (0.48 → 0.52), but **chart questions are still 0**. Infographics become one huge chunk (up to 3,764 chars), and the value gets diluted.
- **Tables were not fixed:** table R@5 0.38–0.50 vs 0.63 for fixed-size.

**v2** (number-like headings ignored, picture text cut into ~400-char pieces):

| Config | R@1 | R@5 | MRR |
|---|---|---|---|
| structure-256-v2 | 0.32 | 0.52 | 0.41 |
| structure-256-noheader-v2 | 0.28 | 0.68 | 0.42 |

- **No real change.** Only 4 headings were fake. The small picture pieces were merged back into ~1,024-char chunks anyway.
- **Charts still 0:** the chart text is a jumble of labels (`Inputs | Outputs | 92,852 cr …`) that doesn't match a question.
- **Verdict:** on this report, structure-aware does not beat fixed-256 (0.68 vs 0.76).
