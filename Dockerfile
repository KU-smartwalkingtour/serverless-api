# Multi-stage build for optimized production image
# Stage 1: Dependencies installation
FROM node:20-alpine AS dependencies

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev) for potential build steps
# Using npm ci for faster, reproducible builds
RUN npm ci && \
    npm cache clean --force

# Stage 2: Production runtime
FROM node:20-alpine AS production

# Add metadata labels
LABEL maintainer="cloudwebservice-team10" \
      description="Cloud Web Service API Server" \
      version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1000 node && \
    adduser -u 1000 -G node -s /bin/sh -D node

# Set working directory
WORKDIR /usr/src/app

# Copy package files with proper ownership
COPY --chown=node:node package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code with proper ownership
COPY --chown=node:node . .

# Switch to non-root user
USER node

# Expose application port
EXPOSE 8000

# Add healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use direct node command for proper signal handling
CMD ["node", "index.js"]
