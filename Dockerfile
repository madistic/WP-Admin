# ==============================================================================
# Stage 1: Dependency Installation
# ==============================================================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# ==============================================================================
# Stage 2: Application Build
# ==============================================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js standalone bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ==============================================================================
# Stage 3: Production Runner (AWS ECS/Fargate)
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install minimal runtime shared libraries
RUN apk add --no-cache libc6-compat

# Security: Run as dedicated non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prepare cache directory with proper ownership
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone server and client static bundles
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
