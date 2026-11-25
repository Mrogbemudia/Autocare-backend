import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.js';
import { receiveDocuments } from '../middleware/documentUpload.js';
import { badRequest } from '../utils/httpError.js';
import * as c from '../controllers/features.controller.js';

const r = Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req,file,next) {
    next(['image/jpeg','image/png','image/webp'].includes(file.mimetype) ? null : badRequest('Use a JPEG, PNG, or WebP image.'));
  },
}).single('image');

r.use(authenticate);
r.get('/maintenance', requireRole('owner'), c.maintenance);
r.post('/maintenance/rules', requireRole('owner'), c.setMaintenanceRule);
r.post('/reminders', requireRole('owner'), c.reminderSettings);
r.get('/insurance/products', requireRole('owner'), c.insuranceProducts);
r.post('/insurance/requests', requireRole('owner'), c.applyInsurance);
r.get('/insurance/requests', requireRole('owner'), c.myInsurance);

r.get('/technician/dashboard', requireRole('shop'), c.technicianDashboard);
r.post('/interviews', requireRole('shop'), c.requestInterview);
r.get('/interviews', requireRole('shop'), c.listInterviews);

r.post('/verification-documents/:ownerType', receiveDocuments, c.submitDocuments);

r.get('/parts-shop/dashboard', requireRole('parts_shop'), c.partsShopDashboard);
r.patch('/parts-shop/me', requireRole('parts_shop'), c.updatePartsShop);
r.get('/parts-shop/orders', requireRole('parts_shop'), c.vendorOrders);
r.post('/parts', requireRole('parts_shop'), (req,res,next) => imageUpload(req,res,(error) => error ? next(error) : next()), c.savePart);
r.patch('/parts/:partId', requireRole('parts_shop'), (req,res,next) => imageUpload(req,res,(error) => error ? next(error) : next()), c.savePart);
r.patch('/parts-shop/orders/:orderId/status', requireRole('parts_shop'), c.updateOrderStatus);

r.get('/parts', requireRole('owner','shop','parts_shop'), c.browseParts);
r.post('/parts/orders', requireRole('owner','shop'), c.checkoutParts);
r.get('/parts/orders', requireRole('owner','shop'), c.buyerOrders);
r.get('/parts/orders/:orderId', c.getOrder);
r.post('/parts/orders/:orderId/paystack', requireRole('owner','shop'), c.initializePartsPayment);
r.post('/parts/orders/:orderId/bank-transfer', requireRole('owner','shop'), c.bankTransfer);
r.post('/parts/payments/paystack/verify/:reference', requireRole('owner','shop'), c.verifyPartsPayment);

r.post('/calls', c.createCall);
r.get('/calls/incoming', c.incomingCalls);
r.patch('/calls/:callId/status', c.updateCall);
r.post('/calls/:callId/signals', c.addCallSignal);
r.get('/calls/:callId/signals', c.callSignals);

export default r;
