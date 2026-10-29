import { Router } from 'express';
import { dashboardController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', dashboardController.getOverview);

export default router;
