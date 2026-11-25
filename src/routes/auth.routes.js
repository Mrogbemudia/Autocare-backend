import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter, refreshLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { loginBody, registerOwnerBody, registerPartsShopBody, registerShopBody } from '../validators/auth.validators.js';
import * as c from '../controllers/auth.controller.js';

const r = Router();
r.post('/register/owner', registerLimiter, validate({ body: registerOwnerBody }), c.registerOwner);
r.post('/register/shop',  registerLimiter, validate({ body: registerShopBody }),  c.registerShop);
r.post('/register/parts-shop', registerLimiter, validate({ body: registerPartsShopBody }), c.registerPartsShop);
r.post('/login',   loginLimiter,   validate({ body: loginBody }), c.login);
r.post('/refresh', refreshLimiter, c.refresh);
r.post('/logout',  c.logout);
r.get('/me', authenticate, c.me);
export default r;
