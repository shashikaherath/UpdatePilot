import { Router } from 'express';
import { settingsController } from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { updateSettingsSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', settingsController.getSettings);
router.patch('/', validate({ body: updateSettingsSchema }), settingsController.updateSettings);

export default router;
