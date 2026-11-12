import { withTransaction } from '../db.js';
import { conflict, notFound } from '../utils/httpError.js';
import * as requests from '../queries/serviceRequests.queries.js';
import * as bookings from '../queries/bookings.queries.js';
import * as workOrders from '../queries/workOrders.queries.js';

// After a decline, the owner proposes another time on the same (still locked) quote.
export async function proposeNewTime(user, requestId, { proposedAt }) {
  return withTransaction(async (client) => {
    const r = await requests.findRequestForUpdate(requestId, client);
    if (!r || r.owner_id !== user.id) throw notFound('Request not found');
    if (r.status !== 'accepted') throw conflict('NOT_AWAITING_BOOKING', 'A new time cannot be proposed for this request');
    const quote = await bookings.findAcceptedQuote(requestId, client);
    if (!quote) throw conflict('NO_ACCEPTED_QUOTE', 'There is no accepted quote');
    if (await bookings.hasLiveBooking(quote.id, client)) throw conflict('BOOKING_EXISTS', 'A booking is already pending');
    return bookings.insertBooking({ quoteId: quote.id, proposedAt }, client);
  });
}

// Confirming creates the work order, with the locked price copied onto it.
export async function confirm(user, bookingId) {
  return withTransaction(async (client) => {
    const b = await bookings.findBookingForUpdate(bookingId, client);
    if (!b || b.shop_user_id !== user.id) throw notFound('Booking not found');
    if (b.status !== 'proposed') throw conflict('BOOKING_NOT_PENDING', 'This booking is no longer pending');
    if (new Date(b.proposed_at) <= new Date()) {
      throw conflict('BOOKING_TIME_PASSED', 'The proposed time has passed. Decline it so the owner can pick another time.');
    }
    await bookings.setBookingStatus(bookingId, 'confirmed', null, client);
    await requests.setRequestStatus(b.service_request_id, 'booked', client);
    const { id } = await workOrders.insertWorkOrder({
      bookingId, serviceRequestId: b.service_request_id, quoteId: b.quote_id, ownerId: b.owner_id,
      shopId: b.shop_id, vehicleId: b.vehicle_id, quotedTotalKobo: b.total_kobo,
    }, client);
    await workOrders.insertStatusHistory({ workOrderId: id, fromStatus: null, toStatus: 'inspection',
      changedBy: user.id, note: 'Booking confirmed. Job created.' }, client);
    return { bookingId, status: 'confirmed', workOrderId: id };
  });
}

export async function decline(user, bookingId, { reason }) {
  return withTransaction(async (client) => {
    const b = await bookings.findBookingForUpdate(bookingId, client);
    if (!b || b.shop_user_id !== user.id) throw notFound('Booking not found');
    if (b.status !== 'proposed') throw conflict('BOOKING_NOT_PENDING', 'This booking is no longer pending');
    await bookings.setBookingStatus(bookingId, 'declined', reason, client);
    return { bookingId, status: 'declined' };
  });
}
