"""
Document Analyzer - Backend Server
------------------------------------
FastAPI backend that:
  1. Accepts a PDF upload OR raw pasted text
  2. Extracts/receives the text
  3. Sends it to the Groq LLM API for analysis (summary / key points / rewrite)
  4. Streams the AI response back to the frontend in real time

Security note:
- The Groq API key is read from an environment variable (GROQ_API_KEY).
- It is NEVER exposed to the frontend or hard-coded in this file.
"""

import os
import json
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from groq import Groq
from dotenv import load_dotenv

from utils.pdf_extractor import extract_text_from_pdf, PDFExtractionError

# Load environment variables from .env (local dev only; in production these
# are injected by the hosting platform / AWS App Runner as real env vars).
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY is not set. The /api/analyze endpoint will fail.")

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = FastAPI(title="Document Analyzer", version="1.0.0")

# CORS - your React frontend will run on a different port (e.g. 5173) during
# local development, so the browser needs explicit permission to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Fine for a class project; restrict to your real
    # frontend domain once you know it, for a production app.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A generous but sane cap so someone can't paste a 500-page book and blow
# past Groq's token limits / your daily free-tier request quota in one go.
MAX_CHARS = 20000


# ---------------------------------------------------------------------------
# Endpoint 1: Upload a PDF, get back extracted plain text.
# The frontend calls this first, shows the extracted text to the user
# (optional), then calls /api/analyze with that text.
# ---------------------------------------------------------------------------
@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()

    try:
        text = extract_text_from_pdf(file_bytes)
    except PDFExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    truncated = len(text) > MAX_CHARS
    if truncated:
        text = text[:MAX_CHARS]

    return {
        "text": text,
        "char_count": len(text),
        "truncated": truncated,
    }


# ---------------------------------------------------------------------------
# Endpoint 2: Analyze text (summary / key_points / rewrite), streamed.
# This is the core endpoint. It accepts either PDF-extracted text or text
# the user typed/pasted directly - the frontend decides which, but the
# backend doesn't care where the text came from.
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=MAX_CHARS)
    mode: str = Field(..., pattern="^(summary|key_points|rewrite)$")


MODE_INSTRUCTIONS = {
    "summary": (
        "Write a clear, concise summary of the following text. "
        "Capture the main ideas and overall argument in a few short paragraphs. "
        "Do not add information that isn't in the source text."
    ),
    "key_points": (
        "Extract the key points from the following text as a clean bulleted list. "
        "Each bullet should be a single, self-contained idea. "
        "Do not add information that isn't in the source text."
    ),
    "rewrite": (
        "Rewrite the following text to be clearer and simpler, while keeping "
        "the original meaning fully intact. Use plain language and shorter sentences. "
        "Do not add or remove any factual content."
    ),
}


def build_prompt(req: AnalyzeRequest) -> str:
    """Builds the prompt sent to the LLM. Keeping this in one place makes
    it easy to document the exact prompt engineering strategy in the
    project report."""
    instruction = MODE_INSTRUCTIONS[req.mode]
    return f"{instruction}\n\nTEXT:\n\"\"\"\n{req.text}\n\"\"\""


async def groq_stream(req: AnalyzeRequest) -> AsyncGenerator[str, None]:
    """Streams tokens from Groq back to the client as Server-Sent Events (SSE).

    Raw text chunks are forwarded as they arrive so the frontend can render
    progressively, satisfying the assignment's 'real-time response' requirement.
    Unlike a quiz generator, this output is meant to be read directly by a
    human (prose or a bullet list), so we do NOT ask the model for JSON here -
    it's just streamed as plain text.
    """
    if client is None:
        yield f"data: {json.dumps({'error': 'Server is not configured with a GROQ_API_KEY.'})}\n\n"
        return

    try:
        stream = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise, faithful document analysis assistant."},
                {"role": "user", "content": build_prompt(req)},
            ],
            temperature=0.5,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                payload = json.dumps({"token": delta})
                yield f"data: {payload}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as exc:  # noqa: BLE001 - surface any LLM/API error to the client
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"


@app.post("/api/analyze")
async def analyze_text(req: AnalyzeRequest):
    """Accepts text + a mode (summary/key_points/rewrite) and streams back
    the LLM's analysis using Server-Sent Events."""
    return StreamingResponse(
        groq_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disables buffering on some proxies so streaming isn't delayed
        },
    )


# ---------------------------------------------------------------------------
# Endpoint 3: Health check - confirms the server (and Groq config) is alive.
# Useful once you deploy to AWS, and for a Docker HEALTHCHECK instruction later.
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "groq_configured": client is not None}