import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js';
import { idParams } from '../validators/common.js';
import { searchShopsQuery, updateShopBody } from '../validators/shops.validators.js';
import * as c from '../controllers/shops.controller.js';

const r = Router();
r.get('/service-types', c.serviceTypes);
r.get('/', optionalAuth, validate({ query: searchShopsQuery }), c.search);
// '/me' must be declared before '/:id'
r.get('/me',   authenticate, requireRole('shop'), c.getMine);
r.patch('/me', authenticate, requireRole('shop'), validate({ body: updateShopBody }), c.updateMine);
r.get('/:id',  optionalAuth, validate({ params: idParams }), c.getPublic);
export default r;
