import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { initializeAgentSystem } from './services/agentService';
import { userTable, initializeCredentialDesignerTables, initializeOid4vcTables } from './db/schema';
import agentRoutes from './routes/agentRoutes';
import connectionRoutes from './routes/connectionRoutes';
import credentialRoutes from './routes/credentialRoutes';
import schemaRoutes from './routes/schemaRoutes';
import credentialDefinitionRoutes from './routes/credentialDefinitionRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import authRoutes from './routes/authRoutes';
import didRoutes from './routes/didRoutes';
import proofRoutes from './routes/proofRoutes';
import { auth } from './middleware/authMiddleware';
import cookieParser from 'cookie-parser';
import demoRoutes from './routes/demoRoutes';
import workflowRoutes from './routes/workflowRoutes';
import signingRoutes from './routes/signingRoutes';
import webrtcRoutes from './routes/webrtcRoutes';
import groupRoutes from './routes/groupRoutes';
import poeRoutes from './routes/poeRoutes';
import { createSocketGateway } from './services/socketGateway';
import wellKnownRoutes, { createIssuerRoutes } from './routes/wellKnownRoutes';
import openBadgesRoutes from './routes/openBadgesRoutes';
import credentialDesignerRoutes from './routes/credentialDesignerRoutes';
import digilockerRoutes from './routes/digilockerRoutes';
import oid4vciRoutes from './routes/oid4vciRoutes';
import oid4vpRoutes from './routes/oid4vpRoutes';
import { initializeRedis, closeRedis } from './services/redis/redisClient';
import { pubsub } from './services/redis/pubsub';
import { bus } from './notifications/bus';


dotenv.config();


const app = express();
// Use only PORT environment variable
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

// Debug logging
console.log('Environment variables:');
console.log('PORT:', process.env.PORT);
console.log('Using PORT:', PORT);
console.log('CORS_ORIGINS:', process.env.CORS_ORIGINS || '(not set)');


// CORS configuration: allow known frontends and local dev variants
// Set CORS_ORIGINS env var with comma-separated list of allowed origins
const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://apisetu.gov.in',
  'https://api-portal.meripehchaan.gov.in',
  'https://digilocker.meripehchaan.gov.in'
];
// Add FRONTEND_URL if set
if (process.env.FRONTEND_URL) {
  defaultOrigins.push(process.env.FRONTEND_URL);
}
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set<string>([...defaultOrigins, ...envOrigins]);

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;
  // Allow any localhost/127.0.0.1 port in dev
  try {
    const u = new URL(origin);
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.protocol === 'http:' || u.protocol === 'https:')) {
      return true;
    }
  } catch {}
  return false;
}

// Early preflight middleware to guarantee headers for OPTIONS
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  if (req.method === 'OPTIONS') {
    console.log(`[CORS] Preflight ${req.method} ${req.url} from ${origin || 'unknown'}`);
  }
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', (req.headers['access-control-request-headers'] as string) || 'Content-Type, Authorization, X-Requested-With, Origin, Accept');
    return res.status(204).end();
  }
  return next();
});

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) {
      console.log('[CORS] Allowing request with no origin header');
      return callback(null, true);
    }
    if (isAllowedOrigin(origin)) {
      console.log('[CORS] Allowing origin:', origin);
      return callback(null, true);
    }
    console.warn('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // Let cors reflect requested headers; avoids case-sensitivity mismatches
  // allowedHeaders omitted intentionally
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Explicit preflight handling (handled by cors, but keep for clarity)
app.options('*', cors(corsOptions));

// Increase body size limit for credential designer (craft_state can be large)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(cookieParser()); // Add cookie parser


app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Credo Express Backend is running' });
});


app.get('/git.new/:repoPath', (req: Request, res: Response) => {
  res.redirect(`https://git.new/${req.params.repoPath}`);
});

// ============================================
// PUBLIC DID DOCUMENT ENDPOINTS (No Auth)
// Required for did:web resolution by external verifiers
// ============================================

// Platform DID: did:web:{domain} -> /.well-known/did.json
app.use('/.well-known', wellKnownRoutes);

// Tenant DIDs: did:web:{domain}:issuers:{tenantId} -> /issuers/{tenantId}/did.json
app.use('/issuers', createIssuerRoutes());

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/digilocker', digilockerRoutes);

// Protected routes with auth middleware
app.use('/api/agent', auth);
app.use('/api/agent', agentRoutes);

app.use('/api/connections', auth);
app.use('/api/connections', connectionRoutes);

app.use('/api/credentials', auth);
app.use('/api/credentials', credentialRoutes);

app.use('/api/schemas', auth);
app.use('/api/schemas', schemaRoutes);

app.use('/api/credential-definitions', auth);
app.use('/api/credential-definitions', credentialDefinitionRoutes);

app.use('/api/dashboard', auth);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/dids', auth);
app.use('/api/dids', didRoutes);

app.use('/api/proofs', auth);
app.use('/api/proofs', proofRoutes);

app.use('/api/demo',demoRoutes);

app.use('/api/workflows', workflowRoutes);

app.use('/api/signing', auth);
app.use('/api/signing', signingRoutes);

app.use('/api/groups', auth);
app.use('/api/groups', groupRoutes);

// OpenBadges API - verification is public, issuance requires auth
// POST /api/openbadges/credentials/verify is PUBLIC (for external verifiers)
app.post('/api/openbadges/credentials/verify', openBadgesRoutes);
// All other endpoints require authentication
app.use('/api/openbadges', auth);
app.use('/api/openbadges', openBadgesRoutes);

// WebRTC signaling - /turn endpoint is public (for ICE server config before auth)
app.get('/api/webrtc/turn', async (req: Request, res: Response) => {
  try {
    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = []

    // Always add public STUN servers (no auth needed)
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })

    // Add custom TURN servers if configured (with auth)
    if (process.env.WEBRTC_TURN_USERNAME && process.env.WEBRTC_TURN_CREDENTIAL) {
      const username = process.env.WEBRTC_TURN_USERNAME
      const credential = process.env.WEBRTC_TURN_CREDENTIAL
      const urls = process.env.WEBRTC_STUN_URLS || ''

      // Parse STUN/TURN URLs and add credentials only to TURN servers
      for (const url of urls.split(',').map((u) => u.trim()).filter(Boolean)) {
        if (url.startsWith('turn:') || url.startsWith('turns:')) {
          iceServers.push({ urls: url, username, credential })
        } else if (url.startsWith('stun:')) {
          iceServers.push({ urls: url })
        }
      }

      // If no TURN URLs were in WEBRTC_STUN_URLS, fall through to public TURN servers
      const hasTurn = iceServers.some((s) =>
        (typeof s.urls === 'string' ? s.urls : s.urls[0])?.startsWith('turn')
      )
    } else {
      // Fallback to free public TURN servers
      iceServers.push({ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' })
      iceServers.push({ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' })
      iceServers.push({ urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' })
    }

    res.json({ iceServers })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})
// All other webrtc routes require auth
app.use('/api/webrtc', auth);
app.use('/api/webrtc', webrtcRoutes);

// POE (Proof of Execution)
app.use('/api/poe', auth);
app.use('/api/poe', poeRoutes);

// Credential Designer (Visual OCA Editor)
app.use('/api/credential-designer', credentialDesignerRoutes);

// OID4VCI routes
// /api/oid4vci/offers - requires auth for offer management
app.use('/api/oid4vci', auth);
app.use('/api/oid4vci', oid4vciRoutes);
// /issuers/:tenantId/token and /issuers/:tenantId/credential - public endpoints for wallet
app.use('/issuers', oid4vciRoutes);

// OID4VP routes
// /api/oid4vp/authorization-requests - requires auth for verification management
app.use('/api/oid4vp', auth);
app.use('/api/oid4vp', oid4vpRoutes);
// /issuers/:tenantId/response - public endpoint for wallet presentation submission
app.use('/issuers', oid4vpRoutes);

// Error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  // Reflect proper CORS headers on error responses
  const origin = req.headers.origin as string | undefined;
  if (!origin || isAllowedOrigin(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    else res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');
    if (corsOptions.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] as string || 'Content-Type, Authorization, X-Requested-With, Origin, Accept');
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});


const startServer = async () => {
  try {
    // Initialize Redis (falls back to in-memory if not configured)
    console.log('Initializing Redis...');
    const redisConnected = await initializeRedis();
    if (redisConnected) {
      console.log('Redis connected - using distributed state/cache');
      await pubsub.initialize();
      console.log('Redis PubSub initialized');
    } else {
      console.log('Redis not available - using in-memory fallback (single-pod mode)');
    }

    // Initialize NotificationBus (uses Redis pub/sub if available)
    await bus.initialize();

    // Initialize database tables
    console.log('Initializing database tables...');
    try {
      await userTable();
      await initializeCredentialDesignerTables();
      await initializeOid4vcTables();
      console.log('Database tables initialized successfully');
    } catch (dbError) {
      console.error('Failed to initialize database tables:', dbError);
      console.log('Continuing server startup - database tables may already exist or will be created later');
    }

    // Start the server first to allow health checks and WS upgrades
    const server = http.createServer(app);
    createSocketGateway(server);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Credo Express backend server running on port ${PORT}`);
      console.log(`WebSocket gateway attached at path ${process.env.WS_PATH || '/ws'}`);
      const ap = Number(process.env.AGENT_PORT || 3003);
      const awsp = Number(process.env.AGENT_WS_PORT || ap + 1);
      console.log(`Agent webhooks (HTTP inbound) at port ${ap}`);
      console.log(`Agent WebSocket inbound at port ${awsp}`);
      if (awsp === PORT) {
        console.warn('[WARN] AGENT_WS_PORT equals API PORT. This can cause 426 on HTTP requests. Set AGENT_WS_PORT to a different port.');
      }
    });

    // Initialize agent system after server starts (non-blocking)
    console.log('Initializing agent system...');
    try {
      await initializeAgentSystem();
      console.log('Agent system initialized successfully');
    } catch (agentError) {
      console.error('Failed to initialize agent system:', agentError);
      console.log('Server is running but agent system is not available');
      // Don't exit - let the server run for health checks and basic API functionality
    }
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};


// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received - shutting down gracefully...`);

  try {
    // Close Redis PubSub
    console.log('Closing Redis PubSub...');
    await pubsub.close();

    // Close Redis connection
    console.log('Closing Redis connection...');
    await closeRedis();

    console.log('Cleanup complete');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));


startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 
