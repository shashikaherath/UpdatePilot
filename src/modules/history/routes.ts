import { Router } from 'express';
import { historyController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { listHistoryQuerySchema } from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/export', validate({ query: listHistoryQuerySchema }), historyController.exportCsv);
router.get('/', validate({ query: listHistoryQuerySchema }), historyController.getHistory);

export default router;
