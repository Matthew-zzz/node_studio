# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_BUILD_WORKER_THREADS=1
COPY package.json package-lock.json ./
# Optional CA for managed build environments; never stored in an image layer.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund --strict-ssl=true
COPY . .
ARG SITE_ORIGIN=https://node-studio.ru
ENV SITE_ORIGIN=${SITE_ORIGIN}
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ARG SOURCE_REVISION=local
LABEL org.opencontainers.image.source="https://github.com/Matthew-zzz/node_studio" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 SITE_OUTPUT_DIR=dist SOURCE_REVISION=${SOURCE_REVISION}
COPY --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/serve.mjs ./scripts/serve.mjs
COPY --chown=node:node scripts/healthcheck.mjs ./scripts/healthcheck.mjs
COPY --chown=node:node scripts/lib/static-server.mjs ./scripts/lib/static-server.mjs
COPY --chown=node:node scripts/lib/static-handler.mjs ./scripts/lib/static-handler.mjs
COPY --chown=node:node scripts/lib/static-encoding.mjs ./scripts/lib/static-encoding.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=10s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "scripts/serve.mjs"]
