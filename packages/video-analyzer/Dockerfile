FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    MCP_TRANSPORT=http \
    HOST=0.0.0.0 \
    PORT=8080 \
    POT_PROVIDER_DIR=/opt/bgutil-pot

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl nodejs npm git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$POT_PROVIDER_DIR" \
    && cd "$POT_PROVIDER_DIR/server" \
    && npm install --omit=optional --no-audit --no-fund \
    && npx tsc \
    && npm cache clean --force

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --upgrade pip \
    && pip install . \
    && pip install bgutil-ytdlp-pot-provider

RUN groupadd -r app && useradd -r -g app -d /app app \
    && mkdir -p /tmp/arvore-video-analyzer \
    && chown -R app:app /app /tmp/arvore-video-analyzer

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["arvore-video-analyzer-mcp"]
