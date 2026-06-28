# ── Affirmation Platform — Developer Makefile ───────────────
# Usage: make <target>
# Prerequisites: Docker Desktop, make

.PHONY: help up down restart logs migrate shell-db shell-redis \
        ps health reset-db nuke

## help: Show this help
help:
	@echo ""
	@echo "  Affirmation Platform — available commands:"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/## /  /'
	@echo ""

# ── Environment ──────────────────────────────────────────────
.env-check:
	@test -f backend/.env || (echo "❌  backend/.env missing — copy backend/.env.example and fill in values" && exit 1)

## up: Start all services (Postgres, Redis, backend, n8n)
up: .env-check
	docker compose up -d --build
	@echo "✅  Services starting. Run 'make health' to check status."

## down: Stop all services (keep volumes)
down:
	docker compose down

## restart: Restart backend only (fast — no image rebuild)
restart:
	docker compose restart backend

## rebuild: Rebuild and restart backend image
rebuild:
	docker compose up -d --build backend

## logs: Tail all logs (Ctrl-C to stop)
logs:
	docker compose logs -f

## logs-backend: Tail backend logs only
logs-backend:
	docker compose logs -f backend

## logs-n8n: Tail n8n logs only
logs-n8n:
	docker compose logs -f n8n

## ps: Show running containers and health status
ps:
	docker compose ps

## health: Hit the /health endpoint
health:
	@curl -s http://localhost:3001/health | python3 -m json.tool || echo "Backend not ready yet"

## migrate: Run database migrations
migrate: .env-check
	docker compose exec backend node src/db/migrate.js

## shell-db: Open a psql shell inside the Postgres container
shell-db:
	docker compose exec postgres psql -U appuser -d identity_platform

## shell-redis: Open a redis-cli shell
shell-redis:
	docker compose exec redis redis-cli

## shell-backend: Open a bash shell in the backend container
shell-backend:
	docker compose exec backend sh

## reset-db: Drop and recreate the database (DESTRUCTIVE — keeps container)
reset-db:
	@echo "⚠️  This will DELETE all data. Press Ctrl-C to cancel, Enter to continue."
	@read confirm
	docker compose exec postgres psql -U appuser -c "DROP DATABASE IF EXISTS identity_platform;"
	docker compose exec postgres psql -U appuser -c "CREATE DATABASE identity_platform;"
	$(MAKE) migrate
	@echo "✅  Database reset complete."

## nuke: Remove all containers AND volumes (full clean slate)
nuke:
	@echo "⚠️  This will DELETE all data including volumes. Press Ctrl-C to cancel."
	@read confirm
	docker compose down -v --remove-orphans
	@echo "✅  All containers and volumes removed."

## import-n8n: Import all n8n workflow JSON files
import-n8n:
	@echo "Open http://localhost:5678 → Settings → Import from file"
	@echo "Files are in: ./n8n_workflows/"
	@ls n8n_workflows/*.json
