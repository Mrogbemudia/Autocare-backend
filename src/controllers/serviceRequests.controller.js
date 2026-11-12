import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/respond.js';
import * as requests from '../services/serviceRequests.service.js';
import * as quotes from '../services/quotes.service.js';
import * as bookings from '../services/bookings.service.js';

export const create = asyncHandler(async (req, res) => created(res, await requests.create(req.user, req.body)));
export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await requests.list(req.user, req.query);
  ok(res, data, meta);
});
export const get = asyncHandler(async (req, res) => ok(res, await requests.getDetail(req.user, req.params.id)));
export const cancel = asyncHandler(async (req, res) => ok(res, await requests.cancel(req.user, req.params.id)));

export const submitQuote = asyncHandler(async (req, res) => created(res, await quotes.submitQuote(req.user, req.params.id, req.body)));
export const listQuotes = asyncHandler(async (req, res) => ok(res, await quotes.listForRequest(req.user, req.params.id)));
export const proposeBooking = asyncHandler(async (req, res) => created(res, await bookings.proposeNewTime(req.user, req.params.id, req.body)));

export const acceptQuote = asyncHandler(async (req, res) => ok(res, await quotes.acceptQuote(req.user, req.params.id, req.body)));
export const rejectQuote = asyncHandler(async (req, res) => ok(res, await quotes.rejectQuote(req.user, req.params.id, req.body)));
export const confirmBooking = asyncHandler(async (req, res) => ok(res, await bookings.confirm(req.user, req.params.id)));
export const declineBooking = asyncHandler(async (req, res) => ok(res, await bookings.decline(req.user, req.params.id, req.body)));
