import { Router } from 'express';
import { scanController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { scanIdParamSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);
router.get('/:id', validate({ params: scanIdParamSchema }), scanController.getScan);

export default router;
