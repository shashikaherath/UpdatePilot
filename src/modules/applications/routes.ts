import { Router } from 'express';
import { applicationController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { listApplicationsQuerySchema, applicationIdParamSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listApplicationsQuerySchema }), applicationController.listApplications);
router.get('/:id', validate({ params: applicationIdParamSchema }), applicationController.getApplicationById);

export default router;
