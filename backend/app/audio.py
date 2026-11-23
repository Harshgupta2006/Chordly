"""Opt-in local audio recognition router. Existing catalog/matching routes stay separate."""

import io
import logging
import os
from pathlib import Path
import sys
import threading
from functools import lru_cache

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
import soundfile as sf
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("chordly.audio")
MAX_BYTES = 2 * 1024 * 1024
_inference_slot = threading.BoundedSemaphore(1)


@lru_cache(maxsize=1)
def get_predictor():
    """Load our local checkpoint once; never accept artifact paths from requests."""
    ml_root = Path(__file__).resolve().parents[2] / "ml"
    sys.path.insert(0, str(ml_root))
    from src.inference.predictor import Predictor

    return Predictor(artifact_dir=os.getenv("CHORDLY_LOCAL_AUDIO_ARTIFACT_DIR"))


def _predict(content: bytes):
    if not _inference_slot.acquire(blocking=False):
        raise HTTPException(429, "Audio recognition is busy. Please retry shortly.")
    try:
        try:
            predictor = get_predictor()
        except Exception:
            logger.exception("Local chord model could not be loaded")
            raise HTTPException(503, "The local chord model is unavailable.") from None
        from src.preprocessing.audio import InvalidAudio

        try:
            with sf.SoundFile(io.BytesIO(content)) as audio:
                if audio.format not in {"WAV", "WAVEX"}:
                    raise HTTPException(415, "Please submit a PCM WAV recording.")
            return predictor.predict_file(io.BytesIO(content))
        except InvalidAudio as exc:
            raise HTTPException(422, str(exc)) from None
        except (sf.LibsndfileError, RuntimeError, OSError):
            raise HTTPException(
                422, "The WAV recording could not be decoded."
            ) from None
    finally:
        _inference_slot.release()


def build_audio_router(limiter):
    router = APIRouter(prefix="/audio", tags=["Local audio recognition"])

    @router.post("/predict-chord")
    @limiter.limit("10/minute")
    async def predict_chord(request: Request, audio: UploadFile = File(...)):
        """Accept 0.25–5 s WAV; discard bytes after inference; no persistent recording."""
        try:
            if audio.content_type not in {
                "audio/wav",
                "audio/x-wav",
                "audio/wave",
                "audio/vnd.wave",
            }:
                raise HTTPException(415, "Only WAV audio is supported.")
            content = await audio.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise HTTPException(413, "Recording exceeds the 2 MiB limit.")
            if not content:
                raise HTTPException(422, "The recording is empty.")
            return await run_in_threadpool(_predict, content)
        finally:
            await audio.close()

    return router
