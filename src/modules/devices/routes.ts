import { Router } from 'express';
import { deviceController } from './controller.js';
import { scanController } from '../scans/controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createPairingCodeSchema, deviceIdParamSchema } from './schemas.js';
import { startScanBodySchema } from '../scans/schemas.js';
import { pairingRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.use(requireAuth);

router.get('/', deviceController.listDevices);
router.post('/pairing-codes', pairingRateLimiter, validate({ body: createPairingCodeSchema }), deviceController.createPairingCode);
router.delete('/:id', validate({ params: deviceIdParamSchema }), deviceController.revokeDevice);

// POST /devices/:id/scans -> Start scan on device
router.post(
  '/:id/scans',
  validate({ params: deviceIdParamSchema, body: startScanBodySchema }),
  scanController.startScan
);

export default router;
