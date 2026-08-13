FROM node:22-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV TRANSFORMERS_CACHE_DIR=/app/models
RUN node -e "const m='Xenova/paraphrase-multilingual-MiniLM-L12-v2';import('@xenova/transformers').then(async ({pipeline,env})=>{env.cacheDir='/app/models';await pipeline('feature-extraction',m);console.log('cached '+m);}).catch(e=>{console.error(e);process.exit(1);})"

FROM node:22-slim

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    HOST=0.0.0.0 \
    PORT=8080 \
    MEMORY_PATH=/data/memories \
    TRANSFORMERS_CACHE_DIR=/app/models

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/models ./models

RUN mkdir -p /data/memories && chown -R node:node /data

USER node

VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "dist/index.js"]
