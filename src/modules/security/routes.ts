import { Router } from 'express';
import { securityController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/findings', securityController.getFindings);

export default router;
