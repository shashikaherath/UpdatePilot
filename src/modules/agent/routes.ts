import { Router } from 'express';
import { agentController } from './controller.js';
import { requireAgentAuth } from '../../middleware/agentAuth.js';
import { validate } from '../../middleware/validate.js';
import {
  agentPairSchema,
  agentHeartbeatSchema,
  agentScanResultsSchema,
  agentJobResultSchema,
  agentJobIdParamSchema,
} from './schemas.js';
import { pairingRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Public: Pair agent device using short-lived one-time code
router.post(
  '/pair',
  pairingRateLimiter,
  validate({ body: agentPairSchema }),
  agentController.pair
);

// All subsequent routes require Authorization: Bearer <deviceToken>
router.use(requireAgentAuth);

router.post(
  '/heartbeat',
  validate({ body: agentHeartbeatSchema }),
  agentController.heartbeat
);

router.post(
  '/jobs/claim',
  agentController.claimJob
);

router.post(
  '/scans/:id/results',
  validate({ params: agentJobIdParamSchema, body: agentScanResultsSchema }),
  agentController.submitScanResults
);

router.post(
  '/jobs/:id/result',
  validate({ params: agentJobIdParamSchema, body: agentJobResultSchema }),
  agentController.submitJobResult
);

router.post(
  '/jobs/:id/heartbeat',
  validate({ params: agentJobIdParamSchema }),
  agentController.renewJobLease
);

export default router;
