import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { config } from './config/index.js';
import { prisma } from './config/prisma.js';
import { requestCorrelation } from './middleware/requestCorrelation.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';

// Route modules
import authRoutes from './modules/auth/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import deviceRoutes from './modules/devices/routes.js';
import scanRoutes from './modules/scans/routes.js';
import applicationRoutes from './modules/applications/routes.js';
import updateRoutes from './modules/updates/routes.js';
import jobRoutes from './modules/jobs/routes.js';
import historyRoutes from './modules/history/routes.js';
import securityRoutes from './modules/security/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import agentRoutes from './modules/agent/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const app = express();

// Trust reverse proxy (Render, Cloudflare, Heroku) for secure cookies & correct client IP
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI inline scripts
  })
);

// Determine allowed origins dynamically for production and dev
const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // Non-browser clients (agent, curl, health monitors)
  const normalized = origin.trim().replace(/\/+$/, '');
  const allowedList = config.allowedOriginsList.map((o) => o.trim().replace(/\/+$/, ''));
  if (allowedList.includes(normalized) || allowedList.includes('*')) {
    return true;
  }
  try {
    const url = new URL(normalized);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.vercel.app') || url.hostname.endsWith('.onrender.com')) return true;
  } catch {
    // Malformed origin, fallback to strict check
  }
  return !config.isProduction;
};

// CORS configuration supporting credentials and all standard REST methods
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(requestCorrelation);
app.use(csrfProtection);

// Safe production health check endpoint verifying server & database connectivity
const healthCheckHandler = async (req: express.Request, res: express.Response) => {
  let dbStatus = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    environment: config.NODE_ENV,
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
};

// Health checks mounted at root and under api prefix
app.get('/health', healthCheckHandler);
app.get(`${config.API_PREFIX}/health`, healthCheckHandler);

// Root welcome endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'UpdatePilot Backend API',
    status: 'online',
    version: '1.0.0',
    health: `${config.API_PREFIX}/health`,
    docs: '/api/docs',
  });
});

// Swagger documentation
try {
  const candidatePaths = [
    join(__dirname, 'docs', 'swagger.json'),
    join(process.cwd(), 'src', 'docs', 'swagger.json'),
    join(process.cwd(), 'dist', 'docs', 'swagger.json'),
  ];
  const foundPath = candidatePaths.find((p) => {
    try {
      return readFileSync(p, 'utf-8');
    } catch {
      return false;
    }
  });

  if (foundPath) {
    const swaggerSpec = JSON.parse(readFileSync(foundPath, 'utf-8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api/docs-json', (req, res) => {
      res.json(swaggerSpec);
    });
  }
} catch (err) {
  console.warn('Could not load swagger.json for /api/docs:', err);
}

// Mount Dashboard API routes: /api/v1
const apiV1Router = express.Router();
apiV1Router.get('/health', healthCheckHandler);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/dashboard', dashboardRoutes);
apiV1Router.use('/devices', deviceRoutes);
apiV1Router.use('/scans', scanRoutes);
apiV1Router.use('/applications', applicationRoutes);
apiV1Router.use('/updates', updateRoutes);
apiV1Router.use('/jobs', jobRoutes);
apiV1Router.use('/history', historyRoutes);
apiV1Router.use('/security', securityRoutes);
apiV1Router.use('/settings', settingsRoutes);

// Primary mount under /api/v1
app.use(config.API_PREFIX, apiV1Router);

// Also mount apiV1Router at root so endpoints like /auth/login, /devices, etc.
// are safely resolved even if a client or proxy calls without the /api/v1 prefix
app.use(apiV1Router);

// Mount Agent API routes: both at /agent/v1 and under /api/v1/agent/v1 for deployment flexibility
app.use(config.AGENT_API_PREFIX, agentRoutes);
app.use(`${config.API_PREFIX}/agent/v1`, agentRoutes);
apiV1Router.use('/agent/v1', agentRoutes);

// Catch-all 404 handler
app.use((req, res, next) => {
  next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
});

// Centralized error handler
app.use(errorHandler);
