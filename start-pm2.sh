#!/bin/bash

# Ensure we're in the project directory
cd "$(dirname "$0")"

# Ensure corepack is enabled and the correct Yarn version is used
echo "Enabling corepack and setting up Yarn 3.3.1..."
corepack enable
corepack prepare yarn@3.3.1 --activate

# Install dependencies if needed
echo "Installing dependencies..."
yarn install
yarn install:all

# Build the applications
echo "Building backend and frontend..."
yarn build:backend
yarn build:frontend

# Start applications using PM2
echo "Starting applications with PM2..."
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js

# Save PM2 process list so they restart on server reboot
pm2 save

# Display running processes
echo "Running processes:"
pm2 list

echo ""
echo "Your application is now running."
echo "To monitor logs use: pm2 logs"
echo "To stop all processes use: pm2 stop all" 