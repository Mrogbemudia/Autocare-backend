import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/workOrders.validators.js';
import * as c from '../controllers/workOrders.controller.js';

const r = Router();
r.use(authenticate);
r.get('/work-orders', requireRole('owner', 'shop', 'admin'), validate({ query: v.listWorkOrdersQuery }), c.list);
r.get('/work-orders/:id', validate({ params: idParams }), c.get);
r.patch('/work-orders/:id/status', requireRole('shop'), validate({ params: idParams, body: v.changeStatusBody }), c.changeStatus);
r.post('/work-orders/:id/extra-work', requireRole('shop'), validate({ params: idParams, body: v.extraWorkBody }), c.raiseExtraWork);
r.post('/extra-work/:id/approve', requireRole('owner'), validate({ params: idParams, body: v.extraDecisionBody }), c.decideExtra('approved'));
r.post('/extra-work/:id/decline', requireRole('owner'), validate({ params: idParams, body: v.extraDecisionBody }), c.decideExtra('declined'));
export default r;
