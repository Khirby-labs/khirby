# Deploy — Khirby

> **Public guide:** [Self-hosted installation](https://khirby.com/docs/guide/self-hosted) · [Getting started](https://khirby.com/docs/guide/getting-started)

Image: **`bearlypro/khirby:latest`** (nginx SPA + NestJS API on port **80**).  
Published by GitHub Actions on `v*.*.*` tags (also `bearlypro/khirby:<tag>`).

- **Swarm / Komodo:** [`docker/docker-stack.yml`](../docker/docker-stack.yml)
- **VPS / Compose:** [Self-hosted](#self-hosted-docker-compose)

---

## Architecture (Swarm)

```
  HTTPS (websecure)
        │
        ▼
  ┌─────────────┐     network: proxy (external)
  │   Traefik   │
  └──────┬──────┘
         │ Host(`${APP_URL}`) → :80
         ▼
  ┌─────────────┐     networks: proxy + khirby-network
  │     app     │     bearlypro/khirby:latest
  └──┬───────┬──┘
     │       │        network: khirby-network
     ▼       ▼
 postgres  redis      bind: ${DATA_PATH}/db|redis
```

**Single `app` replica** — migrations run on container start; multiple replicas can race.

---

## Requirements (Swarm)

| Item | Requirement |
|------|-------------|
| Swarm + Komodo | Cluster with Traefik |
| `proxy` network | External overlay (`external: true`) |
| Image | Docker Hub `bearlypro/khirby` (public pull) |
| Node labels | `storage=hdd`, `tier=always-on` (Postgres/Redis) |
| Data | `${DATA_PATH}` on the labeled node (default `/srv/container-data/khirby`) |

---

## Environment

Template: [`docker/crm.env.example`](../docker/crm.env.example).

| Variable | Description |
|----------|-------------|
| `APP_URL` | Traefik host, e.g. `crm.example.com` (no `https://`) |
| `DATA_PATH` | Bind-mount prefix, e.g. `/srv/container-data/khirby` |
| `POSTGRES_*` | User / password / database |
| `SESSION_SECRET` | **≥ 32 characters** (required in production) |
| `CORS_ORIGIN` | Allowlist for credentialed API (**required** in production; `*` / empty = fail-fast). Public `/api/public/*` stays open |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap first admin |
| `MAIL_SECRETS_KEY` | 32-byte hex key — encrypts IMAP/SMTP passwords and Google refresh tokens |
| `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` | Optional — Gmail/Workspace OAuth |
| `AI_COMPOSE_SECRETS_KEY` | 32-byte hex key — AI Compose |
| `POKELO_SECRETS_KEY` | 32-byte hex key — Pokelo MCP token |
| `MARKETPLACE_CATALOG_URL` | Optional. **Empty or unset = the Marketplace works from the catalog baked into the image and makes no network request at all** — the normal setup. Set it to a versioned JSON document to take the catalog from there instead; https is required in production. An unreachable, oversized, wrongly-typed or invalid document is ignored, the in-image copy is used, and one line is written to the log (ADR-0034) |
| `INSTANCE_PLUGINS_DIR` | Writable `plugins/` dir for self-build (ADR-0036, ADR-0039). Images set `/app/plugins`; compose bind-mounts host `plugins/`, the stack bind-mounts `${DATA_PATH}/plugins`. Unset locally defaults to `<repo>/plugins` |

`DATABASE_URL` / `REDIS_URL` are built by the stack (`khirby-postgres`, `khirby-redis`).

### First start

On a **first** start — when the `plugins` table is entirely empty — the API seeds
the six native plugins so a new instance behaves as it always has. On every later
start it installs nothing: from then on a row in `plugins` is what "installed"
means, and plugins are added from the Marketplace (ADR-0032). Truncating the table
by hand makes the next start seed it again.

---

## Deploy (Komodo / CLI)

```bash
cp docker/crm.env.example docker/crm.env   # fill in secrets
sudo mkdir -p /srv/container-data/khirby/{db,redis}

docker stack deploy \
  --with-registry-auth \
  --env-file docker/crm.env \
  -c docker/docker-stack.yml \
  khirby
```

```bash
docker stack services khirby
docker service logs -f khirby_app
curl -sS "https://${APP_URL}/api/health"
```

### Traefik

Labels on `app`: `proxy` network, `websecure` entrypoint, `cloudflare` certresolver, port **80**.  
SPA and `/api/` share the **same hostname** — `sameSite: strict` cookies work without CORS for the UI.

### Image update

```bash
docker service update \
  --with-registry-auth \
  --image bearlypro/khirby:latest \
  --force \
  khirby_app
```

Migrations run when the container starts.

### Postgres backup

```bash
CID=$(docker ps -q -f name=khirby_khirby-postgres)
docker exec -t "$CID" pg_dump -U crm crm | gzip > "khirby-$(date +%F).sql.gz"
```

---

## Google OAuth (optional)

1. Google Cloud → enable **Gmail API**.
2. OAuth consent screen: **Internal** (Workspace).
3. OAuth client (Web) — redirect URI: `https://${APP_URL}/api/mail/mailbox/oauth/google/callback`
4. Env: `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`, `MAIL_SECRETS_KEY`
5. Restart app → Settings → Mail → “Sign in with Google”

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Traefik 404 | `APP_URL`, labels, `proxy` network |
| `SESSION_SECRET` / `CORS_ORIGIN` | Secret length; allowlist (not `*`) |
| App restart loop | `khirby_app` logs — DB ready; `start_period: 120s` |
| Postgres won't start | Node labels + `DATA_PATH` directory |
| Missing cookie | HTTPS + same SPA/API hostname |

### Checklist

1. [ ] `proxy` network + Traefik
2. [ ] `mkdir` under `DATA_PATH`
3. [ ] Env: `APP_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, passwords, encryption keys
4. [ ] Deploy stack `khirby`
5. [ ] `https://<APP_URL>/api/health` + admin login
6. [ ] Backup via `pg_dump`

---

## Files

| File | Role |
|------|------|
| [`docker/docker-stack.yml`](../docker/docker-stack.yml) | Swarm / Komodo |
| [`docker/crm.env.example`](../docker/crm.env.example) | Env template |
| [`docker/Dockerfile`](../docker/Dockerfile) | Bundle (nginx + API) |
| [`docker/docker-compose.yml`](../docker/docker-compose.yml) | Local split api/web — not Swarm |
| [`docker/docker-compose.dev.yml`](../docker/docker-compose.dev.yml) | Postgres + Redis only (`pnpm start:db`) |

---

## Self-hosted (Docker Compose)

One app container + PostgreSQL + Redis. Put TLS (Caddy / nginx / Traefik) in front.

**Image:** `bearlypro/khirby:latest`

### Prerequisites

- Docker Engine 24+ with Compose v2
- DNS name for HTTPS (production cookies use `secure: true`)
- ~2 GB RAM

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-crm}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-crm}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-crm} -d ${POSTGRES_DB:-crm}']
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ['redis-server', '--appendonly', 'yes']
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  app:
    image: bearlypro/khirby:latest
    environment:
      NODE_ENV: production
      PORT: '3000'
      DATABASE_URL: postgres://${POSTGRES_USER:-crm}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-crm}
      REDIS_URL: redis://redis:6379
      SESSION_SECRET: ${SESSION_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      MAIL_SECRETS_KEY: ${MAIL_SECRETS_KEY:-}
      GOOGLE_MAIL_CLIENT_ID: ${GOOGLE_MAIL_CLIENT_ID:-}
      GOOGLE_MAIL_CLIENT_SECRET: ${GOOGLE_MAIL_CLIENT_SECRET:-}
      AI_COMPOSE_SECRETS_KEY: ${AI_COMPOSE_SECRETS_KEY:-}
      POKELO_SECRETS_KEY: ${POKELO_SECRETS_KEY:-}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - '127.0.0.1:8080:80'
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1/api/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 120s

volumes:
  postgres_data:
  redis_data:
```

### `.env`

```bash
APP_URL=crm.example.com
CORS_ORIGIN=https://crm.example.com

POSTGRES_USER=crm
POSTGRES_PASSWORD=change-me-strong-db-password
POSTGRES_DB=crm

SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-strong-admin-password

# Optional (32-byte hex):
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# MAIL_SECRETS_KEY=
# GOOGLE_MAIL_CLIENT_ID=
# GOOGLE_MAIL_CLIENT_SECRET=
# AI_COMPOSE_SECRETS_KEY=
# POKELO_SECRETS_KEY=
```

### Start

```bash
docker compose pull
docker compose up -d
curl -sS http://127.0.0.1:8080/api/health
```

Terminate TLS to `127.0.0.1:8080`. SPA and API must share the **same hostname**.

### Backup

```bash
CID=$(docker compose ps -q db)
docker exec -t "$CID" pg_dump -U crm crm | gzip > "khirby-$(date +%F).sql.gz"
```
