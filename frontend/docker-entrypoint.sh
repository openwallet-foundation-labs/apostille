#!/bin/sh
set -e

# Runtime environment variable injection for Next.js
# This script replaces placeholder values in the built JS bundle with actual runtime values

echo "Injecting runtime environment variables..."

# Define the placeholder used at build time
PLACEHOLDER_API_URL="__RUNTIME_API_URL__"

# Get runtime values (with fallbacks for local dev)
RUNTIME_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3002}"

echo "  NEXT_PUBLIC_API_URL -> $RUNTIME_API_URL"

# Find and replace in all JS files in .next directory
# Using sed to replace placeholders with actual runtime values
find /app/.next -type f -name "*.js" -exec sed -i "s|${PLACEHOLDER_API_URL}|${RUNTIME_API_URL}|g" {} \;

echo "Runtime configuration complete. Starting Next.js..."

# Execute the main command
exec "$@"
