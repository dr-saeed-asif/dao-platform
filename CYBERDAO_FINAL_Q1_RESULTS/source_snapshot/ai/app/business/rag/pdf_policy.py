"""PDF parsing limits and stable chunking identity."""

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 150
MAX_CHUNKS = 250
TARGET_CHARS = 2_400
OVERLAP_CHARS = 240
CHUNKING_VERSION = "page-boundary-v2"
PREPROCESS_VERSION = "pypdf-normalize-v2"
