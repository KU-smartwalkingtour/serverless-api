# Multi-stage build for optimized production image
# Stage 1: Builder - Build and bundle application
FROM node:20-alpine AS builder

# Add metadata
LABEL stage=builder

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install && \
    npm cache clean --force

# Copy source code
COPY . .

# Run production build (bundling, minification, obfuscation)
# Obfuscation is enabled by default for security
ARG OBFUSCATE=true
ENV OBFUSCATE=${OBFUSCATE}
RUN npm run build

# Stage 2: Production runtime - Minimal production image
FROM node:20-alpine AS production

# Add metadata labels
LABEL maintainer="cloudwebservice-team10" \
      description="Cloud Web Service API Server - Optimized Build" \
      version="1.0.0" \
      build.type="bundled"

# Set working directory
WORKDIR /usr/src/app

# Copy built application from builder stage
COPY --from=builder --chown=node:node /usr/src/app/dist/package*.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy bundled application code
COPY --from=builder --chown=node:node /usr/src/app/dist/index.js ./

# Switch to non-root user for security
USER node

# Expose application port
EXPOSE 8000

# Add healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use direct node command for proper signal handling
CMD ["node", "index.js"]
