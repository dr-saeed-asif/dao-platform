"""PDF indexing commands for the local RAG CLI."""

from pathlib import Path
from .rag_output import dump


async def index_one(rag, filename: str) -> None:
    dump(await rag.store.index(Path(filename)))


async def index_folder(rag, folder: str) -> None:
    root = Path(folder)
    if not root.is_dir(): raise ValueError("PDF folder does not exist.")
    files = sorted(root.glob("*.pdf"))
    if not files or len(files) > 25: raise ValueError("Choose a folder with 1–25 PDF files.")
    output = []
    for path in files:
        try: output.append(await rag.store.index(path))
        except Exception as exc:
            output.append({"filename": path.name, "error": f"{type(exc).__name__}: {exc}"})
    dump(output)
    if any("error" in item for item in output):
        raise ValueError("Some PDFs could not be indexed; see results.")
