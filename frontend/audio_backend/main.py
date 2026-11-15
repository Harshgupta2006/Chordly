"""Dedicated stateless audio API; no database, credentials, uploads or training."""

import io
import logging
import os
import threading
from functools import lru_cache
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
import soundfile as sf
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from predictor import Predictor
from preprocessing import InvalidAudio

MAX_AUDIO = 2 * 1024 * 1024
MAX_BODY = MAX_AUDIO + 64 * 1024
logger = logging.getLogger("chordly.audio")
slot = threading.BoundedSemaphore(1)


def client_ip(request: Request):
    # Vercel sets this header at its trusted ingress; local clients cannot override it.
    if os.getenv("VERCEL") == "1":
        return request.headers.get("x-real-ip") or request.client.host
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def protect_request(request: Request, call_next):
    if request.method == "POST":
        origin = request.headers.get("origin", "")
        parsed = urlsplit(origin)
        # Same-origin browser access only. This is an abuse boundary, not authentication.
        expected = "https://" + request.headers.get("host", "")
        local = os.getenv("VERCEL") != "1" and parsed.hostname in {"localhost", "127.0.0.1"}
        if origin != expected and not local:
            return JSONResponse({"detail": "Use the Chordly website to submit audio."}, status_code=403)
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"detail": "Invalid content length."}, status_code=400)
        if length > MAX_BODY:
            return JSONResponse({"detail": "Recording exceeds the 2 MiB limit."}, status_code=413)
        # Bound actual bytes even when the client omits or lies about Content-Length.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY:
                return JSONResponse({"detail": "Recording exceeds the 2 MiB limit."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.exception_handler(Exception)
async def handle_error(request: Request, error: Exception):
    # Do not log audio, form contents, credentials or exception messages.
    logger.error("Audio request failed (%s)", type(error).__name__)
    return JSONResponse({"detail": "Recognition is temporarily unavailable. Please retry."}, status_code=503)


@lru_cache(maxsize=1)
def get_predictor():
    return Predictor()


def predict(content):
    if not slot.acquire(blocking=False):
        raise HTTPException(429, "Recognition is busy. Please retry shortly.")
    try:
        try:
            with sf.SoundFile(io.BytesIO(content)) as audio:
                if audio.format not in {"WAV", "WAVEX"}:
                    raise HTTPException(415, "Only WAV audio is supported.")
            return get_predictor().predict_file(io.BytesIO(content))
        except (InvalidAudio, sf.LibsndfileError, RuntimeError, OSError):
            raise HTTPException(422, "Use a valid 0.25–5 second WAV recording at 8–192 kHz.") from None
    finally:
        slot.release()


@app.get("/api/audio/health")
def health():
    # Verify the model loads as well as the Python handler.
    get_predictor()
    return {"status": "ok", "runtime": "onnx-cpu", "classes": 25}


@app.post("/api/audio/predict-chord")
@limiter.limit("10/minute")
async def predict_chord(request: Request):
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise HTTPException(415, "Submit multipart WAV audio.")
    async with request.form(max_files=1, max_fields=0, max_part_size=MAX_BODY) as form:
        audio = form.get("audio")
        if not isinstance(audio, UploadFile) or len(form.multi_items()) != 1:
            raise HTTPException(422, "Submit one WAV file in the audio field.")
        if audio.content_type not in {"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"}:
            raise HTTPException(415, "Only WAV audio is supported.")
        content = await audio.read(MAX_AUDIO + 1)
        if len(content) > MAX_AUDIO:
            raise HTTPException(413, "Recording exceeds the 2 MiB limit.")
        if not content:
            raise HTTPException(422, "The recording is empty.")
        return await run_in_threadpool(predict, content)
