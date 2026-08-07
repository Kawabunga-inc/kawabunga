"""Lean Pocket TTS HTTP gateway for a serverless Railway service.

This process intentionally has no database, telemetry exporter, STT runtime, or
background network loop. After startup warm-up completes it can become idle and
Railway Serverless can put it to sleep. The first inbound request wakes it.
"""

import base64
import hashlib
import hmac
import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from threading import Lock
from typing import Iterator

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel


app = FastAPI(title="kawabunga-pocket-tts")

VOICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices")
REMOTE_VOICES_DIR = os.path.join(VOICES_DIR, "_remote")
os.makedirs(REMOTE_VOICES_DIR, exist_ok=True)

DEFAULT_VOICE_ID = "abraham"
DEFAULT_TTS_FIRST_AUDIO_TIMEOUT_SECONDS = 90.0
DEFAULT_TTS_TOTAL_TIMEOUT_SECONDS = 180.0
PROCESS_STARTED_AT = time.time()


class SpeakRequest(BaseModel):
    text: str
    voice: str | None = None
    voiceUrl: str | None = None


class WarmRequest(BaseModel):
    voice: str | None = None
    voiceUrl: str | None = None


class ExportVoiceRequest(BaseModel):
    audioBase64: str
    mimeType: str


class PocketTtsRuntime:
    """One lazily loaded Pocket model with a serialized generation stream."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._generate_lock = Lock()
        self._loaded = False
        self._primed = False
        self._warming = False
        self._error: str | None = None
        self._model = None
        self._sample_rate: int | None = None
        self._voice_states: dict[str, object] = {}
        self._warm_started_at: float | None = None
        self._ready_at: float | None = None

    def _load(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            self._warming = True
            self._warm_started_at = self._warm_started_at or time.time()
            try:
                from pocket_tts import TTSModel

                language = os.getenv("POCKET_TTS_LANGUAGE", "english_2026-01")
                steps = int(os.getenv("POCKET_TTS_LSD_DECODE_STEPS", "5"))
                temp = float(os.getenv("POCKET_TTS_TEMP", "0.5"))
                self._model = TTSModel.load_model(
                    language=language,
                    lsd_decode_steps=steps,
                    temp=temp,
                )
                self._sample_rate = self._model.sample_rate
                self._loaded = True
                self._error = None
            except Exception as error:
                self._error = str(error)
                raise
            finally:
                self._warming = False

    def _voice_path(self, voice_id: str, voice_url: str | None = None) -> str:
        if not voice_id or "/" in voice_id or ".." in voice_id:
            raise HTTPException(status_code=400, detail=f"Invalid voice id: {voice_id!r}")
        baked = os.path.join(VOICES_DIR, f"{voice_id}.safetensors")
        if os.path.isfile(baked):
            return baked
        if voice_url:
            return self._ensure_remote_voice(voice_id, voice_url)
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")

    def _ensure_remote_voice(self, voice_id: str, voice_url: str) -> str:
        url_hash = hashlib.sha256(voice_url.encode("utf-8")).hexdigest()[:16]
        cache_path = os.path.join(REMOTE_VOICES_DIR, f"{voice_id}.{url_hash}.safetensors")
        if os.path.isfile(cache_path):
            return cache_path
        tmp_path = f"{cache_path}.tmp"
        try:
            with urllib.request.urlopen(voice_url, timeout=30) as response:
                if response.status != 200:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Voice fetch failed (HTTP {response.status}) for {voice_id}",
                    )
                with open(tmp_path, "wb") as output:
                    shutil.copyfileobj(response, output)
            os.replace(tmp_path, cache_path)
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(
                status_code=502,
                detail=f"Voice fetch failed for {voice_id}: {error}",
            ) from error
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        return cache_path

    def _state_key(self, voice_id: str, voice_url: str | None) -> str:
        if not voice_url:
            return voice_id
        url_hash = hashlib.sha256(voice_url.encode("utf-8")).hexdigest()[:16]
        return f"{voice_id}@{url_hash}"

    def _get_voice_state(self, voice_id: str, voice_url: str | None = None):
        key = self._state_key(voice_id, voice_url)
        if key in self._voice_states:
            return self._voice_states[key]
        self._load()
        with self._lock:
            if key in self._voice_states:
                return self._voice_states[key]
            assert self._model is not None
            state = self._model.get_state_for_audio_prompt(
                self._voice_path(voice_id, voice_url),
            )
            self._voice_states[key] = state
            return state

    def warm(self, voice_id: str, voice_url: str | None = None) -> None:
        self._load()
        self._get_voice_state(voice_id, voice_url)

    def prime(self, voice_id: str, voice_url: str | None = None) -> None:
        self.warm(voice_id, voice_url)
        if self._primed:
            return
        with self._generate_lock:
            if self._primed:
                return
            assert self._model is not None
            voice_state = self._get_voice_state(voice_id, voice_url)
            for _ in self._model.generate_audio_stream(voice_state, "hello."):
                pass
            self._primed = True
            self._ready_at = time.time()

    def status(self) -> dict[str, object]:
        warmup_ms = None
        if self._warm_started_at is not None and self._ready_at is not None:
            warmup_ms = int((self._ready_at - self._warm_started_at) * 1000)
        return {
            "loaded": self._loaded,
            "warming": self._warming,
            "primed": self._primed,
            "ready": self._loaded and self._primed and bool(self._voice_states),
            "sampleRate": self._sample_rate,
            "voicesCached": list(self._voice_states.keys()),
            "voicesAvailable": sorted(
                filename.removesuffix(".safetensors")
                for filename in os.listdir(VOICES_DIR)
                if filename.endswith(".safetensors")
            )
            if os.path.isdir(VOICES_DIR)
            else [],
            "warmupMs": warmup_ms,
            "error": self._error,
        }

    def stream_pcm_chunks(
        self,
        text: str,
        voice_id: str,
        voice_url: str | None = None,
    ) -> Iterator[bytes]:
        with self._generate_lock:
            self.warm(voice_id, voice_url)
            assert self._model is not None
            voice_state = self._get_voice_state(voice_id, voice_url)
            for chunk in self._model.generate_audio_stream(voice_state, text):
                array = chunk.detach().cpu().numpy() if hasattr(chunk, "detach") else np.asarray(chunk)
                array = np.clip(array, -1.0, 1.0)
                yield (array * 32767.0).astype(np.int16).tobytes()


tts_runtime = PocketTtsRuntime()


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    """Protect billable/model endpoints when a shared token is configured.

    Health/readiness stay public for Railway. Leaving the variable unset keeps
    local development and the legacy migration path working, but production
    deployment documentation requires it.
    """
    expected = os.getenv("POCKET_TTS_API_TOKEN", "").strip()
    if not expected:
        return
    prefix = "Bearer "
    supplied = authorization[len(prefix):].strip() if authorization and authorization.startswith(prefix) else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Pocket TTS authentication failed")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off"}


def _schedule_worker_restart(reason: str) -> None:
    if not _env_bool("POCKET_TTS_RESTART_ON_STALL", True):
        return
    delay = _env_float("POCKET_TTS_RESTART_DELAY_SECONDS", 1.0)

    def restart() -> None:
        time.sleep(delay)
        print(f"[pocket-tts] restarting worker after stalled generation: {reason}", flush=True)
        os._exit(75)

    threading.Thread(target=restart, name="pocket-tts-stall-restart", daemon=True).start()


def _warm_default_voice() -> None:
    voice_id = os.getenv("POCKET_TTS_DEFAULT_VOICE", DEFAULT_VOICE_ID)
    print(f"[startup] Pocket TTS warm-up starting (voice={voice_id})...", flush=True)
    started_at = time.time()
    try:
        # Exercise the inference path so the first user request does not pay
        # graph/codec initialization cost. The generated audio is discarded.
        tts_runtime.prime(voice_id)
        print(
            f"[startup] Pocket TTS ready in {time.time() - started_at:.1f}s",
            flush=True,
        )
    except Exception as error:  # noqa: BLE001
        print(
            f"[startup] Pocket TTS warm-up failed after {time.time() - started_at:.1f}s: {error}",
            flush=True,
        )


@app.on_event("startup")
def warm_on_startup() -> None:
    if not _env_bool("POCKET_TTS_WARM_ON_STARTUP", True):
        return
    threading.Thread(target=_warm_default_voice, name="pocket-tts-warmup", daemon=True).start()


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "service": "pocket-tts",
        "mode": "tts-only",
        "processUptimeMs": int((time.time() - PROCESS_STARTED_AT) * 1000),
        "ttsRuntime": tts_runtime.status(),
    }


@app.get("/readyz")
def readyz():
    status = tts_runtime.status()
    payload = {
        "ok": bool(status["ready"]),
        "service": "pocket-tts",
        "ttsRuntime": status,
    }
    return JSONResponse(payload, status_code=200 if status["ready"] else 503)


@app.post("/warm", dependencies=[Depends(require_api_token)])
def warm(payload: WarmRequest):
    voice_id = payload.voice or DEFAULT_VOICE_ID
    started_at = time.time()
    try:
        tts_runtime.prime(voice_id, payload.voiceUrl)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Pocket TTS warm-up failed: {error}") from error
    return {
        "ok": True,
        "service": "pocket-tts",
        "voice": voice_id,
        "elapsedMs": int((time.time() - started_at) * 1000),
        "ttsRuntime": tts_runtime.status(),
    }


@app.post("/speak", dependencies=[Depends(require_api_token)])
def speak(payload: SpeakRequest):
    handler_entered_at = time.time()
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    voice_id = payload.voice or DEFAULT_VOICE_ID
    voice_url = payload.voiceUrl

    try:
        tts_runtime.warm(voice_id, voice_url)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Pocket TTS init failed: {error}") from error

    setup_done_at = time.time()

    def sse_event(event: str, data: dict) -> bytes:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode("utf-8")

    def event_stream():
        first_chunk_at: float | None = None
        first_audio_timeout = _env_float(
            "POCKET_TTS_FIRST_AUDIO_TIMEOUT_SECONDS",
            DEFAULT_TTS_FIRST_AUDIO_TIMEOUT_SECONDS,
        )
        total_timeout = _env_float(
            "POCKET_TTS_TOTAL_TIMEOUT_SECONDS",
            DEFAULT_TTS_TOTAL_TIMEOUT_SECONDS,
        )
        chunks: queue.Queue[tuple[str, bytes | Exception | None]] = queue.Queue()
        state_lock = Lock()
        state = {"chunks": 0, "done": False, "firstAudioAt": None, "timeout": None}

        def mark_done() -> None:
            with state_lock:
                state["done"] = True

        def mark_timeout(message: str) -> bool:
            with state_lock:
                if state["done"] or state["timeout"]:
                    return False
                state["timeout"] = message
            print(f"[/speak] {message}", flush=True)
            chunks.put(("error", RuntimeError(message)))
            _schedule_worker_restart(message)
            return True

        def monitor_generation() -> None:
            while True:
                time.sleep(0.25)
                elapsed = time.time() - handler_entered_at
                with state_lock:
                    if state["done"] or state["timeout"]:
                        return
                    first_audio_at = state["firstAudioAt"]
                    generated_chunks = int(state["chunks"])
                if first_audio_at is None and elapsed >= first_audio_timeout:
                    mark_timeout(
                        f"Pocket TTS first audio timed out after {int(elapsed * 1000)}ms "
                        f"(voice={voice_id}, chars={len(text)}, chunks={generated_chunks})",
                    )
                    return
                if first_audio_at is not None and elapsed >= total_timeout:
                    mark_timeout(
                        f"Pocket TTS total generation timed out after {int(elapsed * 1000)}ms "
                        f"(voice={voice_id}, chars={len(text)}, chunks={generated_chunks})",
                    )
                    return

        def generate() -> None:
            try:
                for pcm in tts_runtime.stream_pcm_chunks(text, voice_id, voice_url):
                    chunks.put(("audio", pcm))
                chunks.put(("done", None))
            except Exception as error:  # noqa: BLE001
                chunks.put(("error", error))
            finally:
                with state_lock:
                    if state["timeout"] is None:
                        state["done"] = True

        threading.Thread(target=generate, name=f"pocket-tts-generate-{voice_id}", daemon=True).start()
        threading.Thread(target=monitor_generation, name=f"pocket-tts-watchdog-{voice_id}", daemon=True).start()

        try:
            yield sse_event(
                "meta",
                {
                    "sampleRate": tts_runtime._sample_rate,
                    "channels": 1,
                    "encoding": "pcm_s16le",
                    "voice": voice_id,
                    "elapsedMs": int((setup_done_at - handler_entered_at) * 1000),
                },
            )
            index = 0
            while True:
                try:
                    kind, value = chunks.get(timeout=1.0)
                except queue.Empty:
                    continue
                if kind == "done":
                    mark_done()
                    break
                if kind == "error":
                    mark_done()
                    raise value if isinstance(value, Exception) else RuntimeError(str(value))
                if not isinstance(value, bytes):
                    raise RuntimeError("Pocket TTS returned a non-bytes audio chunk")
                if first_chunk_at is None:
                    first_chunk_at = time.time()
                    with state_lock:
                        state["firstAudioAt"] = first_chunk_at
                with state_lock:
                    state["chunks"] = index + 1
                yield sse_event(
                    "audio",
                    {"index": index, "chunk": base64.b64encode(value).decode("ascii")},
                )
                index += 1
            done_at = time.time()
            first_audio_ms = int(((first_chunk_at or done_at) - handler_entered_at) * 1000)
            total_ms = int((done_at - handler_entered_at) * 1000)
            print(
                f"[/speak] voice={voice_id} chars={len(text)} chunks={index} "
                f"first_audio_ms={first_audio_ms} total_ms={total_ms}",
                flush=True,
            )
            yield sse_event(
                "done",
                {
                    "chunks": index,
                    "characters": len(text),
                    "totalMs": total_ms,
                    "firstAudioMs": first_audio_ms,
                },
            )
        except Exception as error:  # noqa: BLE001
            yield sse_event("error", {"message": str(error)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _extension_from_mime(mime_type: str) -> str:
    normalized = (mime_type or "").split(";")[0].strip().lower()
    return {
        "audio/webm": ".webm",
        "audio/mp4": ".mp4",
        "audio/m4a": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/aac": ".aac",
    }.get(normalized, ".webm")


def _candidate_extensions(mime_type: str) -> list[str]:
    preferred = _extension_from_mime(mime_type)
    normalized = (mime_type or "").split(";")[0].strip().lower()
    candidates = [preferred]
    if normalized in {"audio/mp4", "audio/m4a", "audio/aac"}:
        candidates.extend([".webm", ".ogg"])
    elif normalized in {"audio/webm", "audio/ogg"}:
        candidates.extend([".mp4", ".m4a"])
    else:
        candidates.extend([".webm", ".mp4", ".m4a", ".ogg", ".wav"])
    return list(dict.fromkeys(candidates))


def _decode_to_wav_bytes(audio_base64: str, mime_type: str) -> bytes:
    try:
        raw = base64.b64decode(audio_base64, validate=True)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid audioBase64 payload: {error}") from error

    with tempfile.TemporaryDirectory() as temp_dir:
        wav_path = os.path.join(temp_dir, "input.wav")
        last_error = "ffmpeg failed."
        for extension in _candidate_extensions(mime_type):
            source_path = os.path.join(temp_dir, f"input{extension}")
            with open(source_path, "wb") as source_file:
                source_file.write(raw)
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", source_path, "-ar", "24000", "-ac", "1",
                    "-acodec", "pcm_s16le", wav_path,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                with open(wav_path, "rb") as wav_file:
                    return wav_file.read()
            last_error = result.stderr.strip() or last_error
        raise HTTPException(status_code=400, detail=f"Could not decode audio input: {last_error}")


@app.post("/export-voice", dependencies=[Depends(require_api_token)])
def export_voice(payload: ExportVoiceRequest):
    handler_entered_at = time.time()
    wav_bytes = _decode_to_wav_bytes(payload.audioBase64, payload.mimeType)
    with tempfile.TemporaryDirectory() as temp_dir:
        wav_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "out.safetensors")
        with open(wav_path, "wb") as wav_file:
            wav_file.write(wav_bytes)
        command = [
            "pocket-tts", "export-voice", "--language",
            os.getenv("POCKET_TTS_LANGUAGE", "english_2026-01"),
            "--quiet", wav_path, output_path,
        ]
        try:
            result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=180)
        except FileNotFoundError as error:
            raise HTTPException(status_code=500, detail=f"pocket-tts CLI not found: {error}") from error
        except subprocess.TimeoutExpired as error:
            raise HTTPException(status_code=504, detail="pocket-tts export-voice timed out after 180s") from error
        if result.returncode != 0 or not os.path.isfile(output_path):
            full_error = (result.stderr or result.stdout).strip()
            print(f"[/export-voice] FAILED exit={result.returncode}\n{full_error}", flush=True)
            raise HTTPException(
                status_code=500,
                detail=f"pocket-tts export-voice failed (exit {result.returncode}): {full_error[-2000:]}",
            )
        with open(output_path, "rb") as output_file:
            embedding_bytes = output_file.read()
    elapsed_ms = int((time.time() - handler_entered_at) * 1000)
    print(
        f"[/export-voice] bytes_in={len(wav_bytes)} bytes_out={len(embedding_bytes)} total_ms={elapsed_ms}",
        flush=True,
    )
    return StreamingResponse(
        iter([embedding_bytes]),
        media_type="application/octet-stream",
        headers={"Content-Length": str(len(embedding_bytes)), "X-Elapsed-Ms": str(elapsed_ms)},
    )
