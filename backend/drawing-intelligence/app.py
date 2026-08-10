"""
Optional FastAPI wrapper for the drawing-intelligence worker.

  pip install fastapi uvicorn pypdf pymupdf pytesseract pillow
  uvicorn app:app --host 127.0.0.1 --port 8091

Set DWES_DRAWING_INTELLIGENCE_URL=http://127.0.0.1:8091
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from cli_analyse import analyse
from health_probe import build_health

app = FastAPI(title="DWES Drawing Intelligence", docs_url=None, redoc_url=None)


class AnalyseBody(BaseModel):
    drawing_path: str
    expected_headers: list[str] = Field(default_factory=list)
    schedule_terminals_by_header: dict[str, list[str]] = Field(default_factory=dict)
    enrichment: bool = False
    dpi: int = 350
    full_evidence: bool = True
    generation_mode: str = "hybrid"


@app.get("/health")
def health():
    return build_health()


@app.post("/analyse")
def analyse_route(body: AnalyseBody):
    payload = body.model_dump()
    return analyse(payload)
