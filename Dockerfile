# ==============================================================================
# GMRIT Deemed to be University - Enterprise Timetable Management System
# Multi-stage lightweight, non-root, production container image
# ==============================================================================

# Stage 1: Install production dependencies
FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

# All production dependencies are pure JavaScript or WebAssembly (PGlite).
# Native build toolchains (python/make/g++) are not required, keeping builds ultra-fast.
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional

# Stage 2: Final minimal production runtime
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules from dependencies stage
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Copy enterprise application assets
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node supabase ./supabase
COPY --chown=node:node public ./public
COPY --chown=node:node institutional-data ./institutional-data

# Ensure data directory exists with write permissions for local PGlite caching if used
RUN mkdir -p /app/data && chown -R node:node /app/data

# Run as non-root user for enterprise container security compliance
USER node

EXPOSE 3000

# Robust container healthcheck using Node.js native fetch (handles dynamic Render/Cloud ports)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
