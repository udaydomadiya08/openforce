# OpenForce Deployment & Operations Guide

This guide details running OpenForce in production, Docker persistent storage, secure secret generation, first-admin provisioning, backup/restore procedures, and system limitations.

---

> [!IMPORTANT]
> **Private Beta Notice**: OpenForce is currently in **Controlled Private Beta**. While it has undergone internal automated testing, security remediation, and browser end-to-end verification, it has **not** undergone a formal external third-party security audit or compliance certification. Do not deploy to critical enterprise environments without evaluating your risk posture.

---

## 1. Prerequisites

- **Docker & Docker Compose** (Docker Engine 24+ recommended) OR **Node.js 22 LTS** for host deployment.
- **System Requirements**: 
  - Minimum: 1 vCPU, 512MB RAM, 1GB disk space (sufficient for teams up to ~50 users).
  - Recommended: 2 vCPU, 2GB RAM, 10GB SSD.

---

## 2. Environment Variables & Production Configuration

The following environment variables control OpenForce runtime behavior:

| Variable | Default (Dev) | Production Requirement | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | `production` | Enables production mode (masks 500 error traces, enforces strict JWT secret checks). |
| `PORT` | `3000` | Optional (default `3000`) | Port on which the HTTP server listens. |
| `DATABASE_PATH` | `./openforce.db` | `/app/data/openforce.db` | File path to the SQLite database. |
| `JWT_SECRET` | dev fallback | **Mandatory** | Cryptographic secret for signing tokens (min. 32 characters). Production startup will abort if missing, too short, or set to a default. |
| `JWT_EXPIRES_IN_SECONDS` | `604800` (7 days) | Optional | Lifetime of issued JWTs in seconds. Default is 7 days. |
| `AUTO_SEED` | `false` | `false` | When `true`, automatically creates demo accounts (`admin@openforce.local`). Must remain `false` in production. |
| `RATE_LIMIT_AUTH_MAX` | `20` | Optional | Max authentication attempts per IP per 15-minute sliding window. |
| `RATE_LIMIT_API_MAX` | `100` | Optional | Max general API requests per IP per 15-minute sliding window. |
| `TRUST_PROXY` | `false` | Set to `true` behind trusted reverse proxy | When `false`, remote IP is derived directly from the socket to prevent header spoofing. Set `true` only behind Nginx/Caddy/Cloudflare. |

### Generating a Secure JWT Secret

Never use weak or default strings. Generate a cryptographically secure 256-bit random secret using OpenSSL or Node.js:

```bash
# Using OpenSSL (recommended)
openssl rand -hex 32

# Or using Node.js
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

---

## 3. Docker Deployment with Persistent Storage

OpenForce stores data in SQLite using Write-Ahead Logging (WAL) mode for high read concurrency and low latency. Persistent Docker volumes are mandatory to prevent data loss on container recreation.

### Recommended Docker Compose Configuration

The default `docker-compose.yml` mounts a named Docker volume (`openforce_data`) to `/app/data`:

```yaml
services:
  openforce:
    build: .
    container_name: openforce_crm
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/openforce.db
      - JWT_SECRET=${JWT_SECRET}
      - AUTO_SEED=false
    volumes:
      - openforce_data:/app/data
    restart: unless-stopped

volumes:
  openforce_data:
    driver: local
```

### Starting the Application

1. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
2. Set your generated secret in `.env`:
   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   sed -i "s|change_this_to_a_secure_random_string_in_production_32chars|$JWT_SECRET|g" .env
   ```
3. Start the container in detached mode:
   ```bash
   docker compose up -d --build
   ```
4. Verify container health:
   ```bash
   curl http://localhost:3000/health
   # Returns: {"status":"healthy","version":"1.0.0","timestamp":"..."}
   ```

---

## 4. Secure First-Administrator Provisioning

In production mode with `AUTO_SEED=false`, no default users exist. The first user to register becomes the Administrator for a new organization.

### Provisioning Steps

1. Immediately navigate to `http://<your-server>:3000` or invoke the API directly:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@yourcompany.com",
       "password": "StrongMasterPassword123!",
       "first_name": "Primary",
       "last_name": "Admin",
       "org_name": "Your Company Inc"
     }'
   ```
2. The initial registrant is assigned the `Admin` role automatically with full organization privileges.
3. Once logged in, the administrator can invite colleagues and assign roles (`Manager`, `Standard`, `Read-Only`) via the User Management panel.

---

## 5. SQLite Backup and Restoration

Because SQLite operates in WAL mode (`openforce.db`, `openforce.db-wal`, `openforce.db-shm`), taking a consistent snapshot requires flushing WAL pages to disk before capturing the snapshot.

### Automated Backup Procedure

To back up a live running Docker container:

```bash
# 1. Flush any pending WAL writes to disk and checkpoint
docker compose exec openforce node -e "
  import { getDb } from './src/db/index.js';
  getDb().checkpoint();
"

# 2. Copy the database file to your host backup directory
BACKUP_FILE="openforce_backup_$(date +%Y%m%d_%H%M%S).db"
docker cp openforce_crm:/app/data/openforce.db "./backups/${BACKUP_FILE}"

echo "Backup created at ./backups/${BACKUP_FILE}"
```

### Restoration Procedure

To restore from a backup file into a container volume:

```bash
# 1. Stop the application container
docker compose stop openforce

# 2. Copy the backup file into the volume location
docker cp "./backups/${BACKUP_FILE}" openforce_crm:/app/data/openforce.db

# 3. Clean up any stale WAL journal files
docker compose run --rm --entrypoint rm openforce -f /app/data/openforce.db-wal /app/data/openforce.db-shm

# 4. Restart container
docker compose start openforce
```

---

## 6. Running Tests & Verification

OpenForce includes a zero-dependency test runner utilizing Node.js native `node:test` and local Google Chrome:

```bash
# Run complete test suite (Unit, Integration, Security, Browser E2E, Docker Storage)
npm test

# Run individual test files:
node --test tests/security-hardening.test.js
node --test tests/browser-e2e.test.js
node --test tests/docker-storage.test.js
```

---

## 7. Known Architectural Limitations & Release Maturity

OpenForce is designed as a lightweight self-hostable CRM for small and medium teams. Be aware of the following architectural constraints:

1. **Private Beta Status**: OpenForce is under active development. While it has extensive regression test coverage, it is not certified for high-risk enterprise deployments without independent evaluation.
2. **Single-Writer SQLite Concurrency**: SQLite supports virtually unlimited concurrent readers in WAL mode, but serializes write operations (`busy_timeout = 5000ms`). Recommended for teams up to ~50 active users.
3. **Single-Host Storage (No Multi-Node Clustering)**: Embedded SQLite binds to a single local filesystem or named volume. Running multiple container replicas behind a load balancer against the same SQLite database is not supported.
4. **Stateless JWT Revocation Table**: Logout invalidates tokens by storing their SHA-256 hash in a local `revoked_tokens` table. In multi-instance deployments without shared storage, a centralized store (e.g. Redis) is required.
5. **Reverse Proxy Configuration**: Ensure `TRUST_PROXY=true` is only enabled when OpenForce is deployed behind an authenticated reverse proxy that strips client-supplied `X-Forwarded-For` headers.
