#!/bin/bash

# Ensure corepack is enabled and the correct Yarn version is used
echo "Enabling corepack and setting up Yarn 3.3.1..."
corepack enable
corepack prepare yarn@3.3.1 --activate

# Install dependencies if needed
echo "Installing dependencies..."
yarn install:all

# Build the applications
echo "Building backend and frontend..."
yarn build

# Start applications using PM2
echo "Starting applications with PM2..."
pm2 start ecosystem.config.js

# Save PM2 process list so they restart on server reboot
pm2 save

# Display running processes
echo "Running processes:"
pm2 list

echo ""
echo "Your application is now running and will restart automatically if it crashes."
echo "To monitor logs use: pm2 logs"
echo "To stop all processes use: pm2 stop all" 