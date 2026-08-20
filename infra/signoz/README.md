# TisiOps SigNoz

Self-hosted SigNoz runs outside customer servers. Use a separate admin VPS, or Docker Desktop locally.

Current SigNoz docs use Foundry to generate supported Docker Compose. Old bundled Compose files are deprecated.

## Local Start

```bash
cd infra/signoz
cp .env.example .env
curl -fsSL https://signoz.io/foundry.sh | bash
foundryctl cast --file casting.yaml
docker compose -f docker-compose.signoz.yml up -d
```

Dashboard. Current SigNoz Foundry Docker exposes `8080`; older Compose setups used `3301`.

```txt
http://localhost:8080
```

OTLP:

```txt
http://localhost:4318
http://localhost:4317
```

## TisiOps Env

Backend:

```env
OTEL_ENABLED=true
SIGNOZ_ENABLED=true
SIGNOZ_MODE=self_hosted
OTEL_SERVICE_NAME=tisiops-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
SIGNOZ_OTLP_ENDPOINT=http://localhost:4318
SIGNOZ_DASHBOARD_URL=http://localhost:8080
```

Worker:

```env
OTEL_ENABLED=true
SIGNOZ_ENABLED=true
SIGNOZ_MODE=self_hosted
OTEL_SERVICE_NAME=tisiops-worker
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
SIGNOZ_OTLP_ENDPOINT=http://localhost:4318
```

## VPS

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://YOUR_SIGNOZ_SERVER_IP:4318
SIGNOZ_OTLP_ENDPOINT=http://YOUR_SIGNOZ_SERVER_IP:4318
SIGNOZ_DASHBOARD_URL=http://YOUR_SIGNOZ_SERVER_IP:8080
```

## Firewall

Protect SigNoz. Do not expose dashboard publicly without VPN, firewall, or reverse proxy auth.

```bash
sudo ufw allow 22/tcp
sudo ufw allow from YOUR_ADMIN_IP to any port 8080 proto tcp
sudo ufw allow from YOUR_TISIOPS_BACKEND_IP to any port 4318 proto tcp
sudo ufw allow from YOUR_TISIOPS_WORKER_IP to any port 4318 proto tcp
sudo ufw enable
```

Dynamic IP MVP fallback, not production-safe:

```bash
sudo ufw allow 4318/tcp
```

## Ops

```bash
docker ps
docker compose -f docker-compose.signoz.yml logs -f
docker compose -f docker-compose.signoz.yml down
```

Admin page:

```txt
/dashboard/admin/observability
```

## Local npm logs into SigNoz

When TisiOps runs locally with `npm`, its logs stay in the terminal by default.
To view them in SigNoz Logs Explorer, write the dev output to a local log file
and run the local log collector.

From the repository root:

```bash
mkdir -p logs
npm run dev 2>&1 | tee -a logs/tisiops-dev.log
```

In a second terminal:

```bash
cd infra/signoz
docker compose -f docker-compose.tisiops-local-logs.yml up -d
docker logs -f tisiops-local-logs-collector
```

Then open SigNoz:

```txt
http://localhost:8080
```

Go to Logs Explorer and filter by:

```txt
service.name = tisiops-local
```

Structured app logs are emitted as JSON and parsed into attributes. Useful
filters:

```txt
service.name = tisiops-local AND event = 'http.request'
service.name = tisiops-local AND path = '/health'
service.name = tisiops-local AND statusCode >= 500
```

The log body for structured request logs is:

```txt
http.request
```

Common fields:

```txt
event
method
path
statusCode
durationMs
traceId
spanId
userAgent
```

## Local traces into SigNoz

Enable OpenTelemetry in `server/.env`:

```env
OTEL_ENABLED=true
SIGNOZ_ENABLED=true
SIGNOZ_MODE=self_hosted
OTEL_SERVICE_NAME=tisiops-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
SIGNOZ_OTLP_ENDPOINT=http://localhost:4318
SIGNOZ_DASHBOARD_URL=http://localhost:8080
```

Restart the dev server after changing env or observability code:

```bash
npm run dev 2>&1 | tee -a logs/tisiops-dev.log
```

Generate a trace:

```bash
curl http://localhost:5001/health
```

Then open SigNoz Traces and search for:

```txt
service.name = 'tisiops-backend'
```

The collector starts at the end of the file, so generate a fresh log after it
starts by reloading TisiOps or hitting the backend health endpoint:

```bash
curl http://localhost:5001/health
```
