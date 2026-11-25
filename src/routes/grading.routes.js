import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/grading.controller.js';
import { startAttemptSchema, submitAttemptSchema, attemptIdParamSchema } from '../validators/grading.validators.js';

const router = Router();
router.use(authenticate, requireRole('shop'));

router.get('/status', c.status);
router.post('/attempts', validate({ body: startAttemptSchema }), c.start);
router.post('/attempts/:attemptId/submit',
  validate({ params: attemptIdParamSchema }), validate({ body: submitAttemptSchema }), c.submit);

export default router;
// Mount in routes/index.js:  router.use('/grading', gradingRoutes);
