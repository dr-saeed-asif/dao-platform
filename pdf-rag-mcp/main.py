
import uuid
from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException
)
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP

from database import init_database
from rag_service import process_pdf, answer_question, list_documents, answer_all_documents


# =====================================================
# 1. MCP SERVER CONFIGURATION
# =====================================================

mcp = FastMCP(
    "Ollama PDF RAG MCP Server",
    stateless_http=True
)

# Serve MCP at /mcp/
mcp.settings.streamable_http_path = "/"

mcp_app = mcp.streamable_http_app()


# =====================================================
# 2. APPLICATION LIFESPAN
# =====================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database on startup
    init_database()

    # Start MCP session manager
    async with mcp.session_manager.run():
        yield


# =====================================================
# 3. FASTAPI APP
# =====================================================

app = FastAPI(
    title="Ollama PDF RAG API",
    description="Local RAG using Ollama and PostgreSQL",
    lifespan=lifespan
)


# =====================================================
# 4. REQUEST MODEL
# =====================================================

class QuestionRequest(BaseModel):
    document_id: uuid.UUID
    question: str = Field(min_length=1)


# =====================================================
# 5. PDF UPLOAD ENDPOINT
# =====================================================

@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):

    if (
        not file.filename
        or not file.filename.lower().endswith(".pdf")
    ):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )

    # Small file limit for the local starter application.
    max_file_size = 10 * 1024 * 1024

    pdf_bytes = file.file.read(max_file_size + 1)

    if len(pdf_bytes) > max_file_size:
        raise HTTPException(
            status_code=413,
            detail="PDF exceeds 10 MB limit"
        )

    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file"
        )

    try:
        return process_pdf(
            filename=file.filename,
            pdf_bytes=pdf_bytes
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )


# =====================================================
# 6. ASK QUESTION ENDPOINT
# =====================================================

@app.post("/ask")
def ask_pdf(request: QuestionRequest):

    try:
        return answer_question(
            question=request.question,
            document_id=str(request.document_id)
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

# =====================================================
# 7. LIST UPLOADED DOCUMENTS ENDPOINT
# =====================================================

@app.get("/documents")
def get_documents():
    """Return a list of all uploaded PDF documents."""
    return list_documents()

# =====================================================
# 8. MCP TOOLS
# =====================================================

@mcp.tool()
def ask_document(
    document_id: str,
    question: str
) -> dict:
    """
    Ask questions about an uploaded PDF using
    Ollama RAG and PostgreSQL vector search.
    """

    return answer_question(
        question=question,
        document_id=document_id
    )

@mcp.tool()
def ask_all_documents(question: str) -> dict:
    """Answer questions using all uploaded PDFs."""
    return answer_all_documents(question)

@mcp.tool()
def list_uploaded_documents() -> list:
    """
    List all uploaded PDF documents.
    """

    return list_documents()

# =====================================================
# 9. HEALTH CHECK
# =====================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm_provider": "ollama"
    }

class AskAllRequest(BaseModel):
    question: str = Field(min_length=1)


@app.post("/ask-all")
def ask_all_pdf(request: AskAllRequest):
    """Ask a question across all uploaded PDFs."""
    return answer_all_documents(request.question)

# =====================================================
# 10. MOUNT MCP SERVER
# =====================================================

app.mount("/mcp", mcp_app)