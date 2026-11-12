import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { idParams } from '../validators/common.js';
import { createVehicleBody, updateVehicleBody } from '../validators/vehicles.validators.js';
import * as c from '../controllers/vehicles.controller.js';

const r = Router();
r.use(authenticate, requireRole('owner'));
r.get('/', c.list);
r.post('/', validate({ body: createVehicleBody }), c.create);
r.get('/:id', validate({ params: idParams }), c.get);
r.patch('/:id', validate({ params: idParams, body: updateVehicleBody }), c.update);
r.delete('/:id', validate({ params: idParams }), c.remove);
export default r;
