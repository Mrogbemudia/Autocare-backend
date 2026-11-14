import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { receiveRepairMedia } from '../middleware/repairMediaUpload.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/serviceRequests.validators.js';
import * as c from '../controllers/serviceRequests.controller.js';

const r = Router();
r.use(authenticate);

// requests
r.post('/service-requests', requireRole('owner'), receiveRepairMedia, validate({ body: v.createRequestBody }), c.create);
r.get('/service-requests', requireRole('owner', 'shop', 'admin'), validate({ query: v.listRequestsQuery }), c.list);
r.get('/service-requests/:id', validate({ params: idParams }), c.get);
r.post('/service-requests/:id/cancel', requireRole('owner'), validate({ params: idParams }), c.cancel);

// quotes
r.post('/service-requests/:id/quotes', requireRole('shop'), validate({ params: idParams, body: v.createQuoteBody }), c.submitQuote);
r.get('/service-requests/:id/quotes', validate({ params: idParams }), c.listQuotes);
r.post('/quotes/:id/accept', requireRole('owner'), validate({ params: idParams, body: v.acceptQuoteBody }), c.acceptQuote);
r.post('/quotes/:id/reject', requireRole('owner'), validate({ params: idParams, body: v.rejectQuoteBody }), c.rejectQuote);

// bookings
r.post('/service-requests/:id/bookings', requireRole('owner'), validate({ params: idParams, body: v.proposeBookingBody }), c.proposeBooking);
r.post('/bookings/:id/confirm', requireRole('shop'), validate({ params: idParams }), c.confirmBooking);
r.post('/bookings/:id/decline', requireRole('shop'), validate({ params: idParams, body: v.declineBookingBody }), c.declineBooking);
export default r;
