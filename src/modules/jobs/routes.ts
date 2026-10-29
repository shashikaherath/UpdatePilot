import { Router } from 'express';
import { jobController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { jobIdParamSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);
router.get('/:id', validate({ params: jobIdParamSchema }), jobController.getJobById);

export default router;
