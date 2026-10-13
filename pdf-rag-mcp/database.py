
import os
import uuid

import psycopg
from dotenv import load_dotenv
from pgvector import Vector
from pgvector.psycopg import register_vector


# =====================================================
# CONFIGURATION
# =====================================================

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
VECTOR_DIMENSION = 1024


# =====================================================
# 1. DATABASE CONNECTION
# =====================================================

def get_db_connection():
    """Create a PostgreSQL connection with pgvector."""

    conn = psycopg.connect(DATABASE_URL)
    register_vector(conn)

    return conn


# =====================================================
# 2. DATABASE INITIALIZATION
# =====================================================

def init_database():
    """Create tables and vector index if needed."""

    with get_db_connection() as conn:

        conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY,
                filename TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id BIGSERIAL PRIMARY KEY,
                document_id UUID NOT NULL
                    REFERENCES documents(id) ON DELETE CASCADE,
                page_number INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding VECTOR(1024) NOT NULL
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
            ON document_chunks
            USING hnsw (embedding vector_cosine_ops)
        """)

        # Catch an old schema with a different dimension.
        row = conn.execute("""
            SELECT format_type(atttypid, atttypmod)
            FROM pg_attribute
            WHERE attrelid = 'document_chunks'::regclass
              AND attname = 'embedding'
        """).fetchone()

        if not row or row[0] != "vector(1024)":
            raise RuntimeError(
                "Database embedding dimension mismatch. "
                "Expected vector(1024). "
                "Check the table schema in pgAdmin."
            )


# =====================================================
# 3. STORE PDF CHUNKS
# =====================================================

def save_document(filename: str, chunks: list):
    """Store PDF information, chunks and embeddings."""

    if not chunks:
        raise ValueError("No document chunks to save")

    document_id = uuid.uuid4()

    # One transaction: rollback on any insertion failure.
    with get_db_connection() as conn:

        conn.execute(
            """
            INSERT INTO documents (id, filename)
            VALUES (%s, %s)
            """,
            (document_id, filename)
        )

        for chunk in chunks:

            embedding = chunk["embedding"]

            if len(embedding) != VECTOR_DIMENSION:
                raise ValueError(
                    f"Expected {VECTOR_DIMENSION} dimensions, "
                    f"received {len(embedding)}"
                )

            conn.execute(
                """
                INSERT INTO document_chunks
                (
                    document_id,
                    page_number,
                    chunk_text,
                    embedding
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    document_id,
                    chunk["page"],
                    chunk["text"],
                    Vector(embedding)
                )
            )

    return str(document_id)


# =====================================================
# 4. VECTOR SIMILARITY SEARCH
# =====================================================

def search_chunks(
    document_id: str,
    embedding: list,
    top_k: int = 5
):
    """Find chunks using cosine similarity."""

    if len(embedding) != VECTOR_DIMENSION:
        raise ValueError(
            f"Expected {VECTOR_DIMENSION} dimensions, "
            f"received {len(embedding)}"
        )

    if not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20")

    document_uuid = uuid.UUID(str(document_id))
    query_vector = Vector(embedding)

    with get_db_connection() as conn:

        rows = conn.execute(
            """
            SELECT
                page_number,
                chunk_text,
                1 - (embedding <=> %s) AS similarity

            FROM document_chunks

            WHERE document_id = %s

            ORDER BY embedding <=> %s

            LIMIT %s
            """,
            (
                query_vector,
                document_uuid,
                query_vector,
                top_k
            )
        ).fetchall()

    return [
        {
            "page": row[0],
            "text": row[1],
            "similarity": float(row[2])
        }
        for row in rows
    ]

# =====================================================
# Search relevant chunks across all uploaded PDFs.
# =====================================================
def search_all_chunks(embedding: list, top_k: int = 5):
    """Search relevant chunks across all uploaded PDFs."""

    query_vector = Vector(embedding)

    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                d.filename,
                c.page_number,
                c.chunk_text,
                1 - (c.embedding <=> %s) AS similarity
            FROM document_chunks c
            JOIN documents d ON c.document_id = d.id
            ORDER BY c.embedding <=> %s
            LIMIT %s
            """,
            (query_vector, query_vector, top_k)
        ).fetchall()

    return [
        {
            "filename": row[0],
            "page": row[1],
            "text": row[2],
            "similarity": float(row[3])
        }
        for row in rows
    ]

def list_documents_db():
    with get_db_connection() as conn:
        rows = conn.execute("""
            SELECT id, filename
            FROM documents
            ORDER BY created_at DESC
        """).fetchall()

    return [
        {"id": str(row[0]), "filename": row[1]}
        for row in rows
    ]
# =====================================================
# RUN DIRECTLY TO TEST DATABASE
# =====================================================

if __name__ == "__main__":
    init_database()
    print("Database ready! Vector dimension: 1024")
