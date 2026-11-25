import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import auth from './auth.routes.js';
import shops from './shops.routes.js';
import admin from './admin.routes.js';
import vehicles from './vehicles.routes.js';
import serviceRequests from './serviceRequests.routes.js';
import workOrders from './workOrders.routes.js';
import grading from './grading.routes.js';
import featureRoutes from './feature.routes.js';

const r = Router();
r.get('/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
}));
r.use('/auth', auth);
r.use('/shops', shops);
r.use('/admin', admin);
r.use('/vehicles', vehicles);
r.use('/', serviceRequests);
r.use('/', workOrders);
r.use('/grading', grading);
r.use('/', featureRoutes);
export default r;
