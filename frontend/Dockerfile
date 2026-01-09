FROM node:18-bullseye AS builder

# Install build dependencies including Python and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Use placeholder for runtime injection
# This gets replaced at container startup with actual runtime values
ENV NEXT_PUBLIC_API_URL=__RUNTIME_API_URL__
ENV NEXT_PUBLIC_API_BASE_URL=__RUNTIME_API_URL__

# Copy package files
COPY package*.json ./

# Set npm configuration to skip problematic native modules
ENV npm_config_build_from_source=false
ENV npm_config_cache=/tmp/.npm
ENV npm_config_optional=false
ENV SKIP_NATIVE_MODULES=true

# Install dependencies with flags to skip optional and problematic packages
RUN npm ci --omit=optional --ignore-scripts || \
    npm install --omit=optional --ignore-scripts || \
    npm install --legacy-peer-deps --omit=optional

# Copy source code
COPY . .

# Build application with placeholder values
RUN npm run build

# Production image
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy necessary files from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Copy the entrypoint script for runtime config injection
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose the port
EXPOSE 3000

# Use entrypoint for runtime config, then start Next.js
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
