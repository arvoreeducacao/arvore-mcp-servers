FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/client-hub/package.json packages/client-hub/package.json
RUN pnpm install --filter @arvoreeducacao/client-hub-mcp... --frozen-lockfile
COPY tsconfig.json tsconfig.json
COPY packages/client-hub packages/client-hub
RUN pnpm --filter @arvoreeducacao/client-hub-mcp build

FROM base AS prod-deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/client-hub/package.json packages/client-hub/package.json
RUN pnpm install --filter @arvoreeducacao/client-hub-mcp --prod --frozen-lockfile

FROM base AS runtime
WORKDIR /app/packages/client-hub
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV PORT=3000
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/packages/client-hub/node_modules ./node_modules
COPY --from=build /app/packages/client-hub/dist ./dist
COPY packages/client-hub/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
