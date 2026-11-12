"""Validate and display a small embedding comparison."""

from app.model.config.settings import settings

EXPECTED_DIMENSIONS = {"qwen3-embedding:0.6b": 1024}


def show_embedding_results(pdf, document, question) -> None:
    print("\nEmbedding verification\n----------------------")
    print("Model:", document.model, "\nPDF status:", pdf.status)
    print("PDF pages:", pdf.page_count, "\nChunks tested:", len(pdf.chunks[:3]))
    print("Document vectors:", len(document.vectors), "\nQuery vectors:", len(question.vectors))
    print("Document dimensions:", document.dimensions, "\nQuery dimensions:", question.dimensions)
    print("Document embedding ms:", document.latency_ms, "\nQuery embedding ms:", question.latency_ms)
    print("Document input tokens:", document.input_tokens, "\nQuery input tokens:", question.input_tokens)
    _validate_results(document, question, EXPECTED_DIMENSIONS.get(settings.ollama_embed_model))


def _validate_results(document, question, expected: int | None) -> None:
    if document.model != question.model: raise ValueError("Document/query model mismatch.")
    if document.dimensions != question.dimensions: raise ValueError("Document/query dimension mismatch.")
    if expected is not None:
        print("Expected baseline dimensions:", expected)
        if document.dimensions != expected:
            raise ValueError("Actual dimensions differ from baseline expectation.")
    print("\nSUCCESS: Embedding verification passed.")
    print("No vectors were written to PostgreSQL.")
