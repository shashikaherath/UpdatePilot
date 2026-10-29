import { Router } from 'express';
import { updateController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  listUpdatesQuerySchema,
  updateCandidateIdParamSchema,
  executeUpdateBodySchema,
} from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listUpdatesQuerySchema }), updateController.listUpdates);
router.post(
  '/:id/preview',
  validate({ params: updateCandidateIdParamSchema }),
  updateController.previewUpdate
);
router.post(
  '/:id/execute',
  validate({ params: updateCandidateIdParamSchema, body: executeUpdateBodySchema }),
  updateController.executeUpdate
);

export default router;
