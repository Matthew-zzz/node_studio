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
ENV NODE_ENV=production PORTAL_HOST=0.0.0.0 PORTAL_PORT=3000 \
    PORTAL_STATIC_DIR=/app/dist PORTAL_DATABASE=/data/portal.sqlite \
    PORTAL_STATE_DIR=/data PORTAL_BOOTSTRAP_EMPLOYEES=true SOURCE_REVISION=${SOURCE_REVISION}
RUN mkdir -p /data && chown node:node /data && chmod 0700 /data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src/features/portal/model ./src/features/portal/model
COPY --chown=node:node src/features/payments/model ./src/features/payments/model
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=20s --retries=3 CMD ["node", "server/healthcheck.ts"]
CMD ["node", "server/main.ts"]
