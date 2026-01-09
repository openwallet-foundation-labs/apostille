FROM node:20

WORKDIR /app

# Use Yarn 4
RUN corepack enable && corepack prepare yarn@4.3.1 --activate

# System deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Install only backend dependencies (no local tarballs)
COPY package.json ./
# Ensure Yarn uses node-modules linker (not PnP) inside container
RUN echo "nodeLinker: node-modules" > .yarnrc.yml \
    && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install

# Copy sources
COPY tsconfig.json ./
COPY ca-certificate.crt ./
COPY src ./src

# Build
RUN yarn build

EXPOSE 3002 3001

CMD ["yarn", "start"]
