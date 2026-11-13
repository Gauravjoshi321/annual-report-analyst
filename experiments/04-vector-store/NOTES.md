# 04 · Vector store

Move vectors from in-memory into Postgres + pgvector. Exact search vs HNSW index: speed gain vs recall loss.

## Results

_Not run yet._

## To discuss

- **How industry stores chunks in a vector DB:** the table/collection schema (text + embedding + metadata such as doc, page, section path, chunk type, fiscal year), and how metadata filters (e.g. "only financial statements") are used at search time. Needed for 07 routing.
