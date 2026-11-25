import { Router } from 'express';
// ADAPTER: names and signatures below are my guesses at your middleware.
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';          // validate(schema, 'body' | 'params')
import { rateLimit } from '../middleware/rateLimit.js';        // optional: a limiter for test endpoints
import * as c from '../controllers/grading.controller.js';
import { startAttemptSchema, submitAttemptSchema, attemptIdParamSchema } from '../validators/grading.validators.js';

const router = Router();
router.use(authenticate, requireRole('shop'));

router.get('/status', c.status);
router.post('/attempts', validate(startAttemptSchema, 'body'), c.start);
router.post('/attempts/:attemptId/submit',
  validate(attemptIdParamSchema, 'params'), validate(submitAttemptSchema, 'body'), c.submit);

export default router;
// Mount in routes/index.js:  router.use('/grading', gradingRoutes);
