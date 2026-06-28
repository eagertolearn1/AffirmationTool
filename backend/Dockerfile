# ── Build stage ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# ── Runtime stage ──────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install FFmpeg for audio mixing (voice + background music)
RUN apk add --no-cache ffmpeg

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy deps + source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drop write access to source (read-only except /tmp)
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
