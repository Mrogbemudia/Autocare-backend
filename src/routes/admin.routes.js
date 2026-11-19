import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { idParams } from '../validators/common.js';
import { adminListQuery, approveBody, reasonBody } from '../validators/shops.validators.js';
import * as c from '../controllers/shops.controller.js';

const r = Router();
r.use(authenticate, requireRole('admin'));
r.get('/stats', c.adminStats);
r.get('/shops', validate({ query: adminListQuery }), c.adminList);
r.post('/shops/:id/verify',  validate({ params: idParams, body: approveBody }), c.adminDecision('verify'));
r.post('/shops/:id/reject',  validate({ params: idParams, body: reasonBody }),  c.adminDecision('reject'));
r.post('/shops/:id/suspend', validate({ params: idParams, body: reasonBody }),  c.adminDecision('suspend'));
export default r;
