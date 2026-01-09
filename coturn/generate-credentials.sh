#!/bin/bash

# Generate secure TURN server credentials
# Run this script to generate random username and password for production

echo "==================================================================="
echo "TURN Server Credential Generator"
echo "==================================================================="
echo ""

# Generate random username (16 characters)
USERNAME=$(head /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 16)

# Generate random password (32 characters)
PASSWORD=$(head /dev/urandom | tr -dc 'A-Za-z0-9!@#$%^&*' | head -c 32)

echo "Generated credentials for your TURN server:"
echo ""
echo "Username: $USERNAME"
echo "Password: $PASSWORD"
echo ""
echo "==================================================================="
echo "NEXT STEPS:"
echo "==================================================================="
echo ""
echo "1. Update coturn/turnserver.conf:"
echo "   Replace the line:"
echo "   user=turnuser:turnpassword"
echo "   With:"
echo "   user=$USERNAME:$PASSWORD"
echo ""
echo "2. Update docker-compose.yml backend environment:"
echo "   - WEBRTC_TURN_USERNAME=$USERNAME"
echo "   - WEBRTC_TURN_CREDENTIAL=$PASSWORD"
echo ""
echo "3. Restart the services:"
echo "   docker compose down"
echo "   docker compose up -d"
echo ""
echo "==================================================================="
echo "IMPORTANT: Save these credentials securely!"
echo "==================================================================="
