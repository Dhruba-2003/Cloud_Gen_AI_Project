"""
PDF text extraction utility.

Kept in its own file (instead of main.py) so that if you ever need to
support more file formats later (DOCX, TXT, etc.), you only touch this
file — main.py's routing logic stays untouched.
"""

import io
from pypdf import PdfReader


class PDFExtractionError(Exception):
    """Raised when a PDF cannot be read or contains no extractable text."""
    pass


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Takes raw PDF bytes (as received from an uploaded file) and returns
    the extracted plain text.

    Raises PDFExtractionError if the file isn't a valid PDF or has no
    extractable text (e.g. a scanned/image-only PDF with no text layer).
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise PDFExtractionError(f"Could not read PDF file: {exc}") from exc

    if reader.is_encrypted:
        raise PDFExtractionError("This PDF is password-protected and cannot be read.")

    pages_text = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            pages_text.append(text)

    full_text = "\n\n".join(pages_text).strip()

    if not full_text:
        raise PDFExtractionError(
            "No readable text found in this PDF. It may be a scanned "
            "document (image-only) without a text layer."
        )

    return full_text