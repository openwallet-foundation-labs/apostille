# Essi Studio - Verifiable Credentials Platform

A comprehensive platform for issuing, managing, and verifying digital credentials built on open standards.

## Features

### Credential Management
- **Visual Credential Designer** - Drag-and-drop interface for designing credential cards with custom branding, images, and layouts
- **Schema Management** - Create and manage credential schemas with support for multiple DID methods (cheqd, did:web, did:key)
- **Credential Definitions** - Define credential types with OCA (Overlay Capture Architecture) branding overlays

### Issuance & Verification
- **OID4VCI** - OpenID for Verifiable Credential Issuance support
- **OID4VP** - OpenID for Verifiable Presentations for credential verification
- **DIDComm Connections** - Peer-to-peer secure messaging and credential exchange
- **mDL/mdoc Support** - ISO 18013-5 mobile driver's license credentials

### Additional Features
- **OpenBadges 3.0** - Issue and verify OBv3 credentials (Credly-compatible)
- **Workflow Engine** - Configurable credential issuance workflows
- **Group Messaging** - Secure group communication with MLS protocol
- **Digital Signing** - Document signing with verifiable credentials
- **Proof of Execution (POE)** - Zero-knowledge proof verification

## Architecture

```
├── frontend/          # Next.js 16 frontend application
├── backend/           # Express.js backend with Credo-ts agent
├── packages/          # Shared workflow SDK packages
│   ├── workflow-client/
│   ├── workflow-react/
│   ├── workflow-ui-core/
│   └── workflow-backend-express/
└── docker-compose.yml # Docker deployment configuration
```

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for local development)

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure required variables in `.env`:
   ```env
   # Required
   POSTGRES_PASSWORD=your-secure-password
   JWT_SECRET=your-jwt-secret-min-32-chars
   MAIN_WALLET_KEY=your-wallet-key

   # Optional - for full features
   REDIS_URL=redis://localhost:6379
   ```

### Running with Docker

```bash
# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3002
```

### Local Development

```bash
# Install dependencies
yarn install

# Start backend
cd backend && yarn dev

# Start frontend (new terminal)
cd frontend && yarn dev
```

## API Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login

### Connections
- `GET /api/connections` - List connections
- `POST /api/connections/invitation` - Create invitation
- `POST /api/connections/receive-invitation` - Accept invitation

### Credentials
- `GET /api/credentials` - List credentials
- `POST /api/credentials/issue` - Issue credential

### Schemas & Definitions
- `GET /api/schemas` - List schemas
- `POST /api/schemas` - Create schema
- `GET /api/credential-definitions` - List definitions
- `POST /api/credential-definitions` - Create definition

### OID4VC
- `POST /api/oid4vci/offers` - Create credential offer
- `POST /api/oid4vp/authorization-requests` - Create verification request

### OpenBadges
- `POST /api/openbadges/credentials/issue` - Issue badge
- `POST /api/openbadges/credentials/verify` - Verify badge

## Credential Designer

The visual credential designer allows you to:
- Design credential card layouts with drag-and-drop
- Add text, images, and attribute placeholders
- Set background colors, gradients, and images
- Configure branding with logos and colors
- Export to OCA (Overlay Capture Architecture) format
- Generate thumbnail previews automatically

## Technology Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, Craft.js
- **Backend**: Express.js, Credo-ts (Aries Framework)
- **Database**: PostgreSQL with Askar wallet storage
- **Cache**: Redis (optional, for horizontal scaling)
- **Protocols**: DIDComm v2, OID4VC, OpenBadges 3.0

## License

Copyright (c) 2024 Ajna Inc. All rights reserved.
