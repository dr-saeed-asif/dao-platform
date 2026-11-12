"""Run the read-only PDF and question embedding check."""

from app.business.rag.ollama_client import Ollama
from app.services.pdf_service import process_pdf
from .check_embeddings_report import show_embedding_results


async def check_embeddings(pdf_path: str, question: str) -> None:
    print("Processing PDF...")
    pdf = process_pdf(pdf_path)
    if not pdf.chunks:
        print("FAILED: PDF has no extractable chunks.\nPDF status:", pdf.status)
        return
    print("Generating document embeddings...")
    ollama = Ollama()
    document = await ollama.embed_result([chunk.content for chunk in pdf.chunks[:3]])
    print("Generating question embedding...")
    query = await ollama.embed_result([question])
    show_embedding_results(pdf, document, query)
