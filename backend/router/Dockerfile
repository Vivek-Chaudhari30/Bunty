# Router image. Build from the repo root: docker build -f backend/router/Dockerfile .
FROM oven/bun:1.3.11-slim
WORKDIR /app
COPY backend/router/package.json backend/router/
COPY backend/router/src backend/router/src
ENV ROUTER_PORT=8787 ROUTER_DB_PATH=/data/router.db
VOLUME ["/data"]
EXPOSE 8787
USER bun
CMD ["bun", "run", "backend/router/src/main.ts"]
