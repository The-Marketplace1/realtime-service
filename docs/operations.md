# Operations

## Local run

```sh
cp .env.example .env
npm ci
npm run dev
```

Start Redis locally or use `docker compose up --build`. The development-only JWT fallback is intentionally not shared between environments; production must provide the auth service's verification key.

## Production configuration

Set `NODE_ENV=production`, `JWT_SECRET`, `REDIS_URL`, and an explicit comma-separated `CORS_ORIGINS` allowlist. Optionally set `PORT`, `MAX_CONNECTIONS_PER_USER`, and `LOG_LEVEL`. Redis is a required dependency for readiness, presence coordination, and cross-replica Socket.IO broadcasts.

Route `/realtime/socket.io` with WebSocket upgrade support and route `/realtime/health`, `/realtime/ready`, and `/realtime/metrics` to the service. Terminate TLS at the edge and restrict direct access to the service port.

## Container

```sh
docker compose up --build
```

The Compose configuration is for local development. Production deployments should inject secrets through the deployment platform's secret manager and point every replica at the same managed Redis deployment.

## Checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run security
npm run build
```

With the service running and Redis healthy, run `npm run smoke`.

For the Socket.IO/Redis integration suite, build the service, start Redis, then run:

```sh
npm run test:integration
```

After building the image, validate its production readiness endpoint with:

```sh
docker build --tag realtime-service:ci .
npm run docker:validate
```

The CI workflow runs the same Docker validation and then the end-to-end Socket.IO suite.

For a manual connection and heartbeat load sample, set `JWT_SECRET`, optionally set `LOAD_CLIENTS` (default 100), and run `npm run load` against a running service.

