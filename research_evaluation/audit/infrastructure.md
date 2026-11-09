# Run environment

- Windows 11 Home 10.0.26300, Intel Core Ultra 7 155U, 12 physical cores and 14 logical processors, approximately 31.5 GiB usable memory.
- NVIDIA GeForce RTX 3050 Laptop GPU (4 GB class) and Intel integrated graphics. Exact GPU utilization was not instrumented. Ollama's process listing indicated loaded model VRAM allocations during execution.
- Node v22.14.0, Docker Engine 28.0.4, PostgreSQL 16.15, existing pgvector image `sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`.
- Ollama 0.40.5. Model digests and Python library versions are recorded per run in the manifests.
- Default chat `qwen3:4b-instruct`. The configured fast model tag `qwen3.5:4b-instruct` was absent from the inventory. The separate small-model run set both chat model settings to `qwen3:0.6b` for its process only. Embeddings used `qwen3-embedding:0.6b`.
- Docker was initially starting and returned HTTP 500 on its engine pipe. PostgreSQL became healthy after startup. No database reset, schema change, or production source edit was performed.
- Local Ganache contract artifact SHA-256: 14fefd078db686931f85b83f48090babb313ced02d328816d3b071566c5e325b. The prebuilt artifact was used without recompilation.
