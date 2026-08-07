FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/pocket-tts/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch==2.8.0 torchaudio==2.8.0
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/pocket-tts/gateway.py /app/gateway.py
COPY services/audio-rt/voices /app/voices

ENV HF_HOME=/app/.cache/huggingface
ENV PORT=8080
ENV UVICORN_WORKERS=1
ENV POCKET_TTS_WARM_ON_STARTUP=1
ENV POCKET_TTS_FIRST_AUDIO_TIMEOUT_SECONDS=90
ENV POCKET_TTS_TOTAL_TIMEOUT_SECONDS=180
ENV POCKET_TTS_RESTART_ON_STALL=1

EXPOSE 8080

CMD ["sh", "-c", "uvicorn gateway:app --host 0.0.0.0 --port ${PORT} --workers ${UVICORN_WORKERS}"]
