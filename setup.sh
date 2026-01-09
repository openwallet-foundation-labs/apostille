#!/bin/bash

# Install yarn if not installed
if ! command -v yarn &> /dev/null; then
    echo "Yarn not found, installing..."
    npm install -g yarn
fi

# Install concurrently for root package
echo "Installing root dependencies..."
yarn install

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
yarn install
cd ..

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd credo-next-app
yarn install
cd ..

# Create environment files
echo "Creating environment files..."
if [ ! -f "backend/.env" ]; then
    echo "# Agent configuration
AGENT_PORT=3001
AGENT_ENDPOINT=http://localhost:3001

# API configuration
API_PORT=3002

# Optional default admin wallet
# DEFAULT_ADMIN_WALLET_ID=admin-wallet
# DEFAULT_ADMIN_WALLET_KEY=admin-key" > backend/.env
    echo "Created backend/.env"
fi

if [ ! -f "credo-next-app/.env" ]; then
    echo "# API URL for the Express backend
NEXT_PUBLIC_API_URL=http://localhost:3002" > credo-next-app/.env
    echo "Created credo-next-app/.env"
fi

echo "Setup complete! You can now run 'yarn dev' to start both services." 