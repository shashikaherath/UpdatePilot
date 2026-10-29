import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { config } from './config/index.js';
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

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI inline scripts
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, agent)
      if (!origin || config.allowedOriginsList.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(requestCorrelation);
app.use(csrfProtection);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
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

app.use(config.API_PREFIX, apiV1Router);

// Mount Agent API routes: /agent/v1
app.use(config.AGENT_API_PREFIX, agentRoutes);

// Catch-all 404 handler
app.use((req, res, next) => {
  next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
});

// Centralized error handler
app.use(errorHandler);
